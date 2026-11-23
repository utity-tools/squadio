import { NotFoundView } from "@/components/shell/not-found-view";

// Also the answer for a scenario outside the organization: it never says the scenario exists.
// It reads nothing of the request, so it stays static and the page that called notFound() sets
// its title.
export default function NotFound() {
  return <NotFoundView />;
}
