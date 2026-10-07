//src\app\(auth)\auth\layout.tsx
import React from 'react';
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {children}
    </div>
  );
}