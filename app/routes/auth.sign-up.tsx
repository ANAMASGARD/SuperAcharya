import { AuthScreen } from "@/components/auth/AuthScreen";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [
    { title: `Create account — ${APP_TITLE}` },
    { name: "robots", content: "noindex" },
  ];
}

export default function SignUpRoute() {
  return <AuthScreen mode="sign-up" />;
}
