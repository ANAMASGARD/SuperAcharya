import { useSession } from "@agent-native/core/client/use-session";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Play } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { APP_TITLE } from "@/lib/app-config";
import { BOARD_PATH } from "@/lib/chat-paths";
import { SIGN_IN_PATH } from "@/lib/public-routes";

const HERO_VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_151826_c7218672-6e92-402c-9e45-f1e0f454bdc4.mp4";

const NAV_LINKS = ["Learn", "Whiteboard", "About"] as const;

function profileLabel(name: string | undefined, email: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : email;
}

function profileInitial(label: string): string {
  const character = label.trim().charAt(0);
  return character ? character.toUpperCase() : "?";
}

/** Circular account photo. A missing or blocked image falls back to an initial. */
function ProfileAvatar({
  name,
  email,
  image,
}: {
  name?: string;
  email: string;
  image?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = profileLabel(name, email);
  const showImage = Boolean(image) && !imageFailed;
  return (
    <Link
      to={BOARD_PATH}
      aria-label={`${label}. Open the whiteboard.`}
      className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white text-sm font-semibold text-black"
    >
      {showImage ? (
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{profileInitial(label)}</span>
      )}
    </Link>
  );
}

export default function LandingPage() {
  const { status, session } = useSession();
  const prefersReducedMotion = useReducedMotion();

  const isAuthenticated = status === "authenticated" && Boolean(session);

  return (
    <div className="min-h-screen overflow-x-hidden bg-black">
      <section className="relative min-h-screen overflow-hidden bg-black text-white">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 z-0 h-full w-full object-cover"
        >
          <source src={HERO_VIDEO_SRC} type="video/mp4" />
        </video>

        <div className="absolute inset-0 z-1 bg-linear-to-b from-black/60 via-black/40 to-black/80" />

        <nav className="relative z-10 mx-auto max-w-7xl px-6 py-6 sm:px-8">
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-head text-2xl tracking-tight text-white sm:text-3xl">
                {APP_TITLE}
              </span>
            </div>

            <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-10 md:flex">
              {NAV_LINKS.map((link) => (
                <a
                  key={link}
                  href={`#${link.toLowerCase()}`}
                  className="text-sm text-white transition-opacity hover:opacity-80"
                >
                  {link}
                </a>
              ))}
            </div>

            <div className="flex min-w-30 items-center justify-end">
              {isAuthenticated && session ? (
                <ProfileAvatar
                  email={session.email}
                  {...(session.name ? { name: session.name } : {})}
                  {...(session.image ? { image: session.image } : {})}
                />
              ) : (
                <Link
                  to={SIGN_IN_PATH}
                  className="liquid-glass rounded-full px-6 py-2.5 text-sm text-white transition-transform hover:scale-[1.03]"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </nav>

        <div className="relative z-10 flex flex-col items-center justify-start px-6 pt-6 pb-32 text-center sm:pt-10 sm:pb-40">
          <h1 className="font-head max-w-5xl animate-fade-rise text-5xl leading-[0.95] tracking-[-2.46px] text-white sm:text-7xl md:text-8xl">
            Learn concepts with a teacher beside you
          </h1>

          <p className="animate-fade-rise-delay mt-8 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg">
            Super Acharya is your teaching assistant on a shared whiteboard—ask
            questions, see steps written out, and understand ideas the way a
            patient teacher would explain them.
          </p>

          <div className="animate-fade-rise-delay-2 mt-12">
            <Link
              to={BOARD_PATH}
              className="liquid-glass flex items-center gap-2 rounded-full px-14 py-5 text-base text-white transition-transform hover:scale-[1.03]"
            >
              <Play size={18} />
              Get started
            </Link>
          </div>
        </div>

        <motion.div
          className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
          animate={prefersReducedMotion ? { y: 0 } : { y: [0, 8, 0] }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 1.5, repeat: Infinity }
          }
        >
          <ChevronRight size={24} className="rotate-90 text-white/60" />
        </motion.div>
      </section>
    </div>
  );
}
