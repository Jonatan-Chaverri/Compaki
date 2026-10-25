import { redirect } from "next/navigation";

// Existing invitations now lead to the same global seller activation flow.
export default function JoinPage() {
  redirect("/sell");
}
