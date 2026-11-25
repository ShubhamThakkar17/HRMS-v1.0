// Skeleton shown while a heavy, read-only page loads its data on the server.
export function PageSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading">
      <div className="grid gap-2">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-8 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="skeleton h-72" />
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}
