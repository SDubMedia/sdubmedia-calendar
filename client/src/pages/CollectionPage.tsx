// Public collection page at /c/:slug. Lists every gallery linked to the
// collection as a clickable card. No auth — slug is the gate.
//
// Built for the Pixieset "Studio Manager" use case: a single client has
// multiple galleries (engagement + wedding + reception) and you want one
// landing URL to give them.

import { useEffect, useState } from "react";
import { useRoute } from "wouter";

interface CollectionInfo {
  id: string;
  name: string;
  slug: string | null;
  coverSubtitle: string | null;
}

interface GalleryCard {
  id: string;
  title: string;
  token: string;
  slug: string | null;
  coverUrl: string | null;
  fileCount: number;
}

interface OrgInfo {
  name: string;
  logoUrl: string;
}

export default function CollectionPage() {
  const [, params] = useRoute("/c/:slug");
  const slug = params?.slug || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [galleries, setGalleries] = useState<GalleryCard[]>([]);
  const [org, setOrg] = useState<OrgInfo | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/collection-public?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setCollection(data.collection);
        setGalleries(data.galleries || []);
        setOrg(data.org);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="min-h-screen bg-white flex items-center justify-center text-slate-400">Loading…</div>;
  }
  if (error || !collection) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2 text-black">Collection unavailable</h1>
          <p className="text-slate-500">{error || "Not found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&display=swap" rel="stylesheet" />

      {/* Hero */}
      <section className="text-center py-20 sm:py-28 px-6 border-b border-slate-200">
        {org?.name && (
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 mb-6">{org.name}</p>
        )}
        <h1 className="text-black" style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          fontSize: "clamp(2.5rem, 6vw, 5rem)",
          letterSpacing: "0.02em",
          lineHeight: 1.1,
        }}>
          {collection.name}
        </h1>
        {collection.coverSubtitle && (
          <p className="text-slate-500 mt-4 text-xs sm:text-sm uppercase" style={{ letterSpacing: "0.3em" }}>
            {collection.coverSubtitle}
          </p>
        )}
        <p className="text-slate-400 mt-6 text-xs">{galleries.length} galler{galleries.length === 1 ? "y" : "ies"}</p>
      </section>

      {/* Gallery cards */}
      {galleries.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-16">No galleries in this collection yet.</p>
      ) : (
        <div className="max-w-6xl mx-auto p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {galleries.map((g) => {
            const href = g.slug ? `/g/${g.slug}` : `/deliver/${g.token}`;
            return (
              <a
                key={g.id}
                href={href}
                className="group block overflow-hidden bg-slate-100"
              >
                <div className="aspect-[4/3] overflow-hidden bg-slate-200 relative">
                  {g.coverUrl ? (
                    <img src={g.coverUrl} alt={g.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">No preview</div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-medium text-black" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                    {g.title}
                  </h3>
                  <p className="text-[11px] uppercase tracking-widest text-slate-500 mt-1">
                    {g.fileCount} photo{g.fileCount === 1 ? "" : "s"}
                  </p>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400 mt-8">
        Powered by Slate · slate.sdubmedia.com
      </footer>
    </div>
  );
}
