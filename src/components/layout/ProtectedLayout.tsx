"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import type { SessionUser } from "@/lib/auth/session";

interface ProtectedLayoutProps {
  children: React.ReactNode;
  user: SessionUser;
}

export default function ProtectedLayout({ children, user }: ProtectedLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell min-h-screen bg-gray-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-primary-700 focus:shadow-lg"
      >
        Ir al contenido principal
      </a>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Contenido principal */}
      <div className="app-content lg:pl-64">
        <Header user={user} onMenuClick={() => setSidebarOpen(true)} />

        {/* Contenido de la página con márgenes */}
        <main id="main-content" className="app-main p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
