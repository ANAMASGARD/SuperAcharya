import LandingPage from "@/components/landing/LandingPage";
import { APP_TITLE } from "@/lib/app-config";

const SEO_DESCRIPTION =
  "Super Acharya — a teaching assistant on a shared whiteboard that helps you learn concepts step by step, like a real teacher.";

export function meta() {
  const title = `${APP_TITLE}`;
  return [
    { title },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: title },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

export default LandingPage;
