import { redirect } from "next/navigation";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { ToastProvider } from "@/components/ui/Toast";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Layout de las rutas protegidas.
 * Valida la sesión en el servidor antes de renderizar el contenido.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <ProtectedLayout>{children}</ProtectedLayout>
    </ToastProvider>
  );
}
