/**
 * Exact fractions over BigInt, so hours, cost per hour and their products are never rounded on
 * the way (domain rule g): only `round` turns a value into integer cents or basis points.
 */
export class Rational {
  private constructor(
    readonly numerator: bigint,
    readonly denominator: bigint,
  ) {}

  static of(numerator: bigint | number, denominator: bigint | number = 1n): Rational {
    let n = BigInt(numerator);
    let d = BigInt(denominator);
    if (d === 0n) throw new RangeError("Division by zero");
    if (d < 0n) [n, d] = [-n, -d];
    const divisor = gcd(n < 0n ? -n : n, d);
    return new Rational(n / divisor, d / divisor);
  }

  /** A number written with at most `maxDecimals` decimals (37.5, 1550), read from its digits. */
  static fromDecimal(value: number, maxDecimals = 2): Rational {
    const match = new RegExp(`^(-?)(\\d+)(?:\\.(\\d{1,${maxDecimals}}))?$`).exec(String(value));
    if (!match) throw new RangeError(`Expected at most ${maxDecimals} decimals, got ${value}`);
    const [, sign, units, decimals = ""] = match;
    return Rational.of(BigInt(`${sign}${units}${decimals}`), 10n ** BigInt(decimals.length));
  }

  static readonly ZERO = Rational.of(0);

  plus(other: Rational): Rational {
    return Rational.of(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  times(other: Rational): Rational {
    return Rational.of(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  dividedBy(other: Rational): Rational {
    return Rational.of(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  isZero(): boolean {
    return this.numerator === 0n;
  }

  /** The nearest integer, halves away from zero. Refuses one a number cannot hold exactly. */
  round(): number {
    const magnitude = this.numerator < 0n ? -this.numerator : this.numerator;
    const rounded = (2n * magnitude + this.denominator) / (2n * this.denominator);
    if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(`${this.numerator}/${this.denominator} rounds beyond a safe integer`);
    }
    return Number(this.numerator < 0n ? -rounded : rounded);
  }

  /** For display only (hours): money never leaves as a float. */
  toNumber(): number {
    return Number(this.numerator) / Number(this.denominator);
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

export const sum = (values: Iterable<Rational>): Rational => {
  let total = Rational.ZERO;
  for (const value of values) total = total.plus(value);
  return total;
};
