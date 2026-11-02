import { redirect } from "next/navigation";

// The home page is the dashboard. (middleware.ts sends logged-out visitors to /login first.)
export default function Home() {
  redirect("/dashboard");
}
