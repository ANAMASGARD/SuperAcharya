/**
 * Shared sizing for the sign-in / sign-up screens. Heights come from the
 * `--auth-control`, `--auth-gap` and `--auth-title` variables on `.auth-screen`
 * (see `app/global.css`), which scale with the viewport height so the whole
 * form, including the social buttons, fits without scrolling on short windows.
 */

/** Text inputs: viewport-scaled height, rounded corners, hard shadow. */
export const FIELD_CLASS =
  "h-(--auth-control) rounded-xl bg-white px-3.5 text-base text-black shadow-[3px_3px_0_0_#000] sm:text-sm";

/** The yellow primary action. */
export const PRIMARY_BUTTON_CLASS =
  "h-(--auth-control) w-full rounded-xl py-0 text-sm";

/** White secondary actions, including the social provider buttons. */
export const OUTLINE_BUTTON_CLASS =
  "h-(--auth-control) w-full gap-2.5 rounded-xl bg-white py-0 font-sans text-sm font-semibold text-black hover:bg-white";

/** Screen and panel titles. */
export const TITLE_CLASS =
  "font-head text-(length:--auth-title) leading-none";
