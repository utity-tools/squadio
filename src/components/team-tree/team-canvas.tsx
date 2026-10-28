"use client";

import {
  type Edge,
  type EdgeProps,
  type FitViewOptions,
  Handle,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import {
  ScanIcon,
  TriangleAlertIcon,
  UserIcon,
  UserRoundSearchIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  Fragment,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { MemberMenu } from "@/components/team-editing/member-menu";
import type { TeamEditing } from "@/components/team-editing/team-editing";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDayRange } from "@/components/format/use-day-range";
import { type LayoutNode, NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout/compact-layout";
import type { AssignmentCard } from "@/lib/team-tree/cards";
import { type Point, edgePath, teamEdges } from "@/lib/team-tree/edges";
import { type Moves, pathToRoot, treeNavigation } from "@/lib/team-tree/navigation";
import { viewportShowing } from "@/lib/team-tree/viewport";
import { cn } from "@/lib/utils";

type CardNode = Node<
  { card: AssignmentCard; selected: boolean; onPath: boolean; tabbable: boolean },
  "assignment"
>;
type ReportEdge = Edge<{ points: Point[]; onPath: boolean }, "report">;

export type TeamCanvasProps = {
  team: { id: string; reportsTo: string | null }[];
  nodes: LayoutNode[];
  cards: AssignmentCard[];
  /** The selected assignment, shared with the table view; null when nothing is selected. */
  selected: string | null;
  /** Called when a node is clicked or takes focus. */
  onSelect: (id: string) => void;
  /** The nodes' menus; null for a team that cannot be edited here. */
  editing?: TeamEditing | null;
};

/**
 * What a node card calls when it is clicked or focused, and where tooltips go: inside the canvas,
 * so they stay in the page's landmarks.
 */
const CanvasContext = createContext<{
  select: (id: string) => void;
  tooltips: HTMLElement | null;
  editing: TeamEditing | null;
  /** The node whose menu is open. */
  menuFor: string | null;
  setMenuFor: (id: string | null) => void;
}>({
  select: () => {},
  tooltips: null,
  editing: null,
  menuFor: null,
  setMenuFor: () => {},
});

const ARROWS: Record<string, keyof Moves> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const ZOOM_DURATION = 200;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
/** Fitting never zooms past 100%: a small team keeps the card size of the layout. */
const FIT_VIEW = { maxZoom: 1 } satisfies FitViewOptions;
/** React Flow's own zoom in and out step. */
const ZOOM_STEP = 1.2;

/**
 * The read-only team tree on a React Flow canvas: positions come from the compact layout.
 * Controlled: the selection lives with the caller, so the tree and the table can share it.
 */
export function TeamCanvas(props: TeamCanvasProps) {
  return (
    <ReactFlowProvider>
      <TooltipProvider>
        <Canvas {...props} />
      </TooltipProvider>
    </ReactFlowProvider>
  );
}

function Canvas({
  team,
  nodes: layout,
  cards,
  selected,
  onSelect,
  editing = null,
}: TeamCanvasProps) {
  const t = useTranslations("TeamTree");
  const tEditing = useTranslations("TeamEditing");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const instructions = useId();
  const flow = useReactFlow();
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  const zoomLevel = useStore((state) => state.transform[2]);
  /** Once someone zooms or pans, resizing the canvas no longer fits the team again. */
  const moved = useRef(false);
  const navigation = treeNavigation(team, layout);
  const tabStop = selected ?? navigation.root;
  const path = new Set(selected === null ? [] : pathToRoot(team, selected));
  const position = new Map(layout.map((node) => [node.id, node]));
  const cardOf = new Map(cards.map((card) => [card.id, card]));

  const nodes: CardNode[] = layout.map(({ id, x, y }) => ({
    id,
    type: "assignment",
    position: { x, y },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: {
      card: cardOf.get(id)!,
      selected: id === selected,
      onPath: path.has(id),
      tabbable: id === tabStop,
    },
    // The card inside is the focusable element; the wrapper is only a position.
    domAttributes: { "aria-roledescription": undefined },
  }));
  const edges: ReportEdge[] = teamEdges(team, layout).map(({ id, source, target, points }) => ({
    id,
    source,
    target,
    targetHandle: position.get(target)?.inLeafColumn ? "left" : "top",
    type: "report",
    data: { points, onPath: path.has(target) },
    zIndex: path.has(target) ? 1 : 0,
    // The lines repeat what the arrow keys tell; the table view is the one for screen readers.
    domAttributes: { "aria-hidden": true },
  }));

  function select(id: string) {
    onSelect(id);
    show(id);
  }

  /** Brings a node into view (canvas brief: "Focused node scrolls into view"). */
  function show(id: string) {
    const node = position.get(id);
    if (!node || !canvas) return;
    const size = { width: canvas.clientWidth, height: canvas.clientHeight };
    const viewport = viewportShowing(node, flow.getViewport(), size);
    if (viewport) void flow.setViewport(viewport);
  }

  function zoom(action: "in" | "out" | "fit") {
    moved.current = action !== "fit";
    // Reduced motion: no tweens (canvas brief, "Keyboard and focus").
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const options = { duration: reduced ? 0 : ZOOM_DURATION };
    if (action === "fit") {
      void flow.fitView({ ...options, ...FIT_VIEW });
      return;
    }
    // From a focused node, zoom around it so it stays in view; otherwise around the centre.
    const focused = document.activeElement?.closest<HTMLElement>("[data-assignment]");
    const node = focused?.dataset.assignment && position.get(focused.dataset.assignment);
    if (!node) {
      void (action === "in" ? flow.zoomIn(options) : flow.zoomOut(options));
      return;
    }
    const step = action === "in" ? ZOOM_STEP : 1 / ZOOM_STEP;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, flow.getZoom() * step));
    void flow.setCenter(node.x + NODE_WIDTH / 2, node.y + NODE_HEIGHT / 2, { ...options, zoom });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const zoomKey = ({ "+": "in", "=": "in", "-": "out", "0": "fit" } as const)[event.key];
    if (zoomKey) {
      event.preventDefault();
      zoom(zoomKey);
      return;
    }
    const target = event.target as HTMLElement;
    const id = target.closest<HTMLElement>("[data-assignment]")?.dataset.assignment;
    // Enter opens the node's menu (canvas brief, "Keyboard parity"), instead of clicking it.
    if (event.key === "Enter" && editing && id !== undefined) {
      event.preventDefault();
      setMenuFor(id);
      return;
    }
    const arrow = ARROWS[event.key];
    if (id === undefined || (arrow === undefined && event.key !== "Home")) return;
    event.preventDefault();
    const next = arrow ? navigation.moves.get(id)?.[arrow] : navigation.root;
    if (!next) return;
    canvas
      ?.querySelector<HTMLElement>(`[data-assignment="${CSS.escape(next)}"]`)
      ?.focus({ preventScroll: true });
  }

  // Owner decision: the whole team stays in view at every width, also on the narrow screens where
  // the table is the default view and the tree is still one click away.
  useEffect(() => {
    if (!canvas) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!moved.current) void flow.fitView(FIT_VIEW);
      });
    });
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [flow, canvas]);

  return (
    <CanvasContext value={{ select, tooltips: canvas, editing, menuFor, setMenuFor }}>
      <p id={instructions} className="sr-only">
        {t("instructions")}
        {editing && ` ${tEditing("instructions")}`}
      </p>
      <ReactFlow
        ref={setCanvas}
        aria-label={t("label")}
        aria-describedby={instructions}
        className="h-full min-h-96"
        // The cards scale with the canvas; their focus ring divides by the zoom to stay 2 px.
        style={{ "--zoom": zoomLevel } as CSSProperties}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onKeyDown={onKeyDown}
        // A click handler is also what lets React Flow pass pointer events to read-only nodes.
        onNodeClick={(_, node) => select(node.id)}
        onMoveStart={(event) => {
          if (event) moved.current = true;
        }}
        fitView
        fitViewOptions={FIT_VIEW}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        disableKeyboardA11y
        deleteKeyCode={null}
        panActivationKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        // The wheel scrolls the page, not the canvas.
        zoomOnScroll={false}
        preventScrolling={false}
        zoomOnDoubleClick={false}
      >
        <Panel position="top-right">
          <div
            role="group"
            aria-label={t("controls")}
            className="flex flex-col gap-1 rounded-md border bg-background p-1 shadow-sm"
          >
            <ControlButton label={t("zoomIn")} onClick={() => zoom("in")}>
              <ZoomInIcon aria-hidden />
            </ControlButton>
            <ControlButton label={t("zoomOut")} onClick={() => zoom("out")}>
              <ZoomOutIcon aria-hidden />
            </ControlButton>
            <ControlButton label={t("fitView")} onClick={() => zoom("fit")}>
              <ScanIcon aria-hidden />
            </ControlButton>
          </div>
        </Panel>
      </ReactFlow>
    </CanvasContext>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const { tooltips } = useContext(CanvasContext);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" container={tooltips}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** A node card: structure and hours, never money (canvas brief, "Tree view"). */
function AssignmentNode({ data: { card, selected, onPath, tabbable } }: NodeProps<CardNode>) {
  const t = useTranslations("TeamTree");
  const format = useFormatter();
  const dayRange = useDayRange();
  const { select, tooltips, editing, menuFor, setMenuFor } = useContext(CanvasContext);
  const hours = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const person = card.person ?? t("openRole");
  const allocation = format.number(card.allocation / 100, { style: "percent" });
  const weekly = t("weeklyHours", { hours: hours(card.allocatedWeeklyHours) });
  const dates = card.dates && dayRange(card.dates.start, card.dates.end);
  const effective = t("effectiveHours", { hours: hours(card.effectiveHours) });
  const schedule = [allocation, weekly, ...(dates ? [dates] : [])];
  const PersonIcon = card.person ? UserIcon : UserRoundSearchIcon;

  return (
    <>
      <Handle
        type="target"
        id="top"
        position={Position.Top}
        isConnectable={false}
        className="invisible"
      />
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        isConnectable={false}
        className="invisible"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="invisible"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-assignment={card.id}
            data-open-role={card.person ? undefined : ""}
            data-on-path={onPath ? "" : undefined}
            tabIndex={tabbable ? 0 : -1}
            aria-current={selected || undefined}
            onFocus={() => select(card.id)}
            style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
            className={cn(
              "flex cursor-pointer flex-col items-start gap-0.5 rounded-lg border bg-card p-2.5 text-left text-card-foreground shadow-sm [outline-width:calc(2px/var(--zoom,1))] [outline-offset:calc(2px/var(--zoom,1))]",
              card.person === null && "border-2 border-dashed border-muted-foreground",
              onPath && "border-foreground",
              selected && "border-2 bg-accent text-accent-foreground",
            )}
          >
            <span
              className={cn("w-full truncate text-sm leading-5 font-semibold", editing && "pe-6")}
            >
              {card.title}
            </span>
            <Pause />
            <span className="flex w-full items-center gap-1 text-sm leading-5">
              <PersonIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{person}</span>
            </span>
            <Pause />
            <span className="flex w-full items-center gap-1.5 text-xs leading-4">
              <span className="min-w-0 truncate rounded-full border px-1.5">{card.category}</span>
              {card.missingRate && (
                <>
                  <Pause />
                  <span data-missing-rate="" className="flex shrink-0 items-center gap-0.5">
                    <TriangleAlertIcon aria-hidden className="size-3.5 text-status-warn" />
                    {t("missingRate")}
                  </span>
                </>
              )}
            </span>
            <Pause />
            <span className="w-full truncate text-xs leading-4 text-muted-foreground">
              {schedule.map((part, index) => (
                <Fragment key={index}>
                  {index > 0 && (
                    <>
                      <span aria-hidden> · </span>
                      <Pause />
                    </>
                  )}
                  {part}
                </Fragment>
              ))}
            </span>
            <Pause />
            <span className="mt-auto w-full truncate text-xs leading-4 font-medium tabular-nums">
              {effective}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" container={tooltips}>
          {/* The card truncates long text: the tooltip gives it in full. */}
          <span className="block font-semibold">{card.title}</span>
          <span className="block">{person}</span>
          <span className="block">{card.category}</span>
          {card.missingRate && <span className="block">{t("missingRateDetail")}</span>}
          <span className="block">{t("nominalHours", { hours: hours(card.nominalHours) })}</span>
        </TooltipContent>
      </Tooltip>
      {editing && (
        <MemberMenu
          id={card.id}
          editing={editing}
          open={menuFor === card.id}
          onOpenChange={(open) => setMenuFor(open ? card.id : null)}
          owner={() =>
            document.querySelector<HTMLElement>(`[data-assignment="${CSS.escape(card.id)}"]`)
          }
          trigger="button"
          className="absolute top-2 right-2"
        />
      )}
    </>
  );
}

/** Separates the lines of a card for screen readers, which read it as one name. */
function Pause() {
  return <span className="sr-only">, </span>;
}

/** A report line; the path to the selected node is drawn stronger, on top. */
function ReportLine({ data }: EdgeProps<ReportEdge>) {
  if (!data) return null;
  return (
    <path
      d={edgePath(data.points)}
      fill="none"
      strokeWidth={data.onPath ? 2 : 1}
      className={data.onPath ? "stroke-foreground" : "stroke-muted-foreground"}
    />
  );
}

const nodeTypes = { assignment: AssignmentNode };
const edgeTypes = { report: ReportLine };
