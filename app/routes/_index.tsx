import LandingPage from "@/components/landing/LandingPage";
import { APP_TITLE } from "@/lib/app-config";

const SEO_DESCRIPTION =
  "Super Acharya — multimodal AI teaching on a shared whiteboard for students.";

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
