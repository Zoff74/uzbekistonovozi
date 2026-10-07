import { Suspense } from "react";
import CatalogVokalContent from "@/components/CatalogVokalContent";

export default function VokalCatalogPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#030712] text-emerald-400">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CatalogVokalContent />
    </Suspense>
  );
}