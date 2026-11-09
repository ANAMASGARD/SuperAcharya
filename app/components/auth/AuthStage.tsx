import { appPath } from "@agent-native/core/client/api-path";
import type { CSSProperties } from "react";
import { Link } from "react-router";

import { APP_TITLE } from "@/lib/app-config";
import { LANDING_PATH } from "@/lib/public-routes";

const INK = "#000";
const CHALK = "#fff";
const SKIN = "#F6C9A0";
const MINT = "#B8E5E1";
const CORAL = "#FFB5A7";
const MARKER = "#C2410C";

/** Each board line is covered by a chalk-white panel that slides away, so the lesson "writes itself". */
function reveal(delay: string): CSSProperties {
  return { animationDelay: delay };
}

function Whiteboard() {
  return (
    <g>
      <rect x="62" y="180" width="540" height="300" rx="22" fill={INK} />
      <rect x="50" y="168" width="540" height="300" rx="22" fill={CHALK} stroke={INK} strokeWidth="6" />
      <rect x="80" y="468" width="480" height="18" rx="9" fill={INK} />
      <rect x="470" y="458" width="46" height="10" rx="5" fill={CORAL} stroke={INK} strokeWidth="3" />
      <rect x="524" y="458" width="30" height="10" rx="5" fill={CHALK} stroke={INK} strokeWidth="3" />

      <g>
        <text x="96" y="252" className="font-head" fontSize="48" fill={INK}>
          2x + 3 = 11
        </text>
        <rect className="sa-reveal" style={reveal("0.5s")} x="84" y="196" width="490" height="76" fill={CHALK} />
      </g>

      <g>
        <text x="96" y="338" className="font-head" fontSize="48" fill={INK}>
          2x = 11 − 3
        </text>
        <ellipse cx="368" cy="322" rx="25" ry="34" fill="none" stroke={MARKER} strokeWidth="5" />
        <text x="410" y="332" className="font-sans" fontSize="20" fontWeight="700" fill={MARKER}>
          − 3 both sides
        </text>
        <rect className="sa-reveal" style={reveal("1.5s")} x="84" y="282" width="490" height="76" fill={CHALK} />
      </g>

      <g>
        <rect x="96" y="372" width="170" height="70" rx="14" fill={INK} />
        <rect x="90" y="366" width="170" height="70" rx="14" fill="#FFDB33" stroke={INK} strokeWidth="5" />
        <text x="112" y="418" className="font-head" fontSize="48" fill={INK}>
          x = 4
        </text>
        <rect className="sa-reveal" style={reveal("2.5s")} x="80" y="356" width="500" height="90" fill={CHALK} />
      </g>
    </g>
  );
}

/** Speech bubble with rounded corners and a tail at the bottom-left. */
const STUDENT_BUBBLE =
  "M70 40 H374 Q388 40 388 54 V104 Q388 118 374 118 H108 L82 144 V118 H70 Q56 118 56 104 V54 Q56 40 70 40 Z";

function StudentBubble() {
  return (
    <g>
      <path d={STUDENT_BUBBLE} transform="translate(10 10)" fill={INK} />
      <path d={STUDENT_BUBBLE} fill={CHALK} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <text x="78" y="90" className="font-sans" fontSize="25" fontWeight="700" fill={INK}>
        Why did the 3 move over?
      </text>
    </g>
  );
}

/** Speech bubble with rounded corners and a tail pointing right, at the teacher. */
const TEACHER_BUBBLE =
  "M54 522 H358 Q372 522 372 536 V554 L406 582 L372 592 V612 Q372 626 358 626 H54 Q40 626 40 612 V536 Q40 522 54 522 Z";

function TeacherBubble() {
  return (
    <g>
      <path d={TEACHER_BUBBLE} transform="translate(10 10)" fill={INK} />
      <path d={TEACHER_BUBBLE} fill={MINT} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <text x="64" y="568" className="font-sans" fontSize="24" fontWeight="700" fill={INK}>
        Take 3 from both sides.
      </text>
      <text x="64" y="602" className="font-sans" fontSize="24" fontWeight="700" fill={INK}>
        Watch the board.
      </text>
    </g>
  );
}

function Teacher() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M404 720 V692 Q404 650 442 642 H522 Q560 650 560 692 V720 Z" fill={CORAL} stroke={INK} strokeWidth="6" />
      <rect x="470" y="626" width="22" height="22" rx="6" fill={SKIN} stroke={INK} strokeWidth="5" />

      <line x1="440" y1="668" x2="424" y2="512" stroke={INK} strokeWidth="24" />
      <line x1="440" y1="668" x2="424" y2="512" stroke={CORAL} strokeWidth="12" />
      <rect x="414" y="468" width="12" height="34" rx="4" fill="#FFDB33" stroke={INK} strokeWidth="3" transform="rotate(-12 420 485)" />
      <circle cx="423" cy="504" r="14" fill={SKIN} stroke={INK} strokeWidth="5" />

      <circle cx="481" cy="588" r="50" fill={SKIN} stroke={INK} strokeWidth="6" />
      <path d="M431 582 Q431 528 483 528 Q533 528 533 580 Q510 558 482 560 Q452 560 431 582 Z" fill={INK} />
      <circle cx="463" cy="592" r="15" fill={CHALK} stroke={INK} strokeWidth="5" />
      <circle cx="501" cy="592" r="15" fill={CHALK} stroke={INK} strokeWidth="5" />
      <line x1="478" y1="592" x2="486" y2="592" stroke={INK} strokeWidth="5" />
      <circle cx="466" cy="594" r="4" fill={INK} />
      <circle cx="504" cy="594" r="4" fill={INK} />
      <path d="M463 616 Q482 632 501 616" fill="none" stroke={INK} strokeWidth="5" />
    </g>
  );
}

/**
 * Left half of the auth screens: the product in one picture. A student asks
 * why a step happened, the teacher answers, and the board writes the working.
 * The illustration scales to the panel, so it never forces the page to scroll.
 */
export function AuthStage() {
  return (
    <aside className="auth-stage relative hidden flex-col overflow-hidden rounded-3xl border-2 border-black bg-primary shadow-[6px_6px_0_0_#000] lg:flex">
      <header className="relative z-10 px-7 pt-5">
        <Link
          to={LANDING_PATH}
          className="inline-flex items-center gap-2.5 rounded-lg font-head text-xl leading-none"
        >
          <img
            src={appPath("/pwa/icon-192.png")}
            alt=""
            width={40}
            height={40}
            className="rounded-lg border-2 border-black bg-white"
          />
          {APP_TITLE}
        </Link>
      </header>
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-7 pt-2 pb-5">
        <svg
          viewBox="0 0 640 720"
          role="img"
          aria-label="A student asks why the 3 moved to the other side of the equation. The teacher answers and the whiteboard writes out the steps."
          className="h-full max-h-full w-full max-w-[560px]"
        >
          <StudentBubble />
          <Whiteboard />
          <TeacherBubble />
          <Teacher />
        </svg>
      </div>
    </aside>
  );
}
