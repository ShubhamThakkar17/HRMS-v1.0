'use client';
import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div className="grid gap-3">
        <h1>Something went wrong</h1>
        <p className="text-muted">The error has been logged. Try again, or go back to the home page.</p>
        <div className="flex justify-center gap-2">
          <button className="btn" onClick={reset}>
            Try again
          </button>
          <Link className="btn btn-ghost" href="/">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
