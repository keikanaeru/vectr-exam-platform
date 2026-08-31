import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

function cx(
  ...values: Array<
    string | false | null | undefined
  >
) {
  return values
    .filter(Boolean)
    .join(" ");
}

export function PageHeader({
  title,
  description,
  context,
  meta,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  context?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cx(
        "r9-page-header",
        className
      )}
    >
      <div className="r9-page-header__main">
        {context ? (
          <div className="r9-page-header__context">
            {context}
          </div>
        ) : null}

        <h1 className="r9-page-header__title">
          {title}
        </h1>

        {description ? (
          <div className="r9-page-header__description">
            {description}
          </div>
        ) : null}

        {meta ? (
          <div className="r9-page-header__meta">
            {meta}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div className="r9-page-header__actions">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function Surface({
  children,
  className,
  as = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  const classes = cx(
    "r9-surface",
    className
  );

  if (as === "article") {
    return (
      <article className={classes}>
        {children}
      </article>
    );
  }

  if (as === "div") {
    return (
      <div className={classes}>
        {children}
      </div>
    );
  }

  return (
    <section className={classes}>
      {children}
    </section>
  );
}

export type MetricItem = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?:
    | "neutral"
    | "accent"
    | "success"
    | "warning"
    | "danger";
};

export function MetricStrip({
  items,
  className,
}: {
  items: MetricItem[];
  className?: string;
}) {
  return (
    <div
      className={cx(
        "r9-metric-strip",
        className
      )}
    >
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="r9-metric-strip__item"
          data-tone={item.tone ?? "neutral"}
        >
          <span className="r9-metric-strip__label">
            {item.label}
          </span>

          <strong className="r9-metric-strip__value">
            {item.value}
          </strong>

          {item.detail ? (
            <span className="r9-metric-strip__detail">
              {item.detail}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

type ButtonVariant =
  | "primary"
  | "secondary"
  | "quiet"
  | "danger";

type ButtonBaseProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
};

type ButtonProps =
  ButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type ButtonLinkProps =
  ButtonBaseProps & {
    href: string;
    target?: "_blank";
    rel?: string;
  };

export function Button(
  props:
    | ButtonProps
    | ButtonLinkProps
) {
  const variant =
    props.variant ?? "secondary";

  const classes = cx(
    "r9-button",
    `r9-button--${variant}`,
    props.className
  );

  if (
    "href" in props &&
    typeof props.href === "string"
  ) {
    const {
      href,
      target,
      rel,
      children,
    } = props;

    return (
      <Link
        href={href}
        target={target}
        rel={rel}
        className={classes}
      >
        {children}
      </Link>
    );
  }

  const {
    children,
    variant: _variant,
    className: _className,
    type = "button",
    ...buttonProps
  } = props as ButtonProps;

  return (
    <button
      type={type}
      className={classes}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

export function Status({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?:
    | "neutral"
    | "accent"
    | "success"
    | "warning"
    | "danger";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "r9-status",
        className
      )}
      data-tone={tone}
    >
      <span
        className="r9-status__signal"
        aria-hidden="true"
      />

      {children}
    </span>
  );
}