import { AuthScreen } from "@/components/auth/AuthScreen";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [
    { title: `Sign in — ${APP_TITLE}` },
    { name: "robots", content: "noindex" },
  ];
}

export default function SignInRoute() {
  return <AuthScreen mode="sign-in" />;
}
