import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div className="grid gap-2">
        <h1>Page not found</h1>
        <p className="text-muted">It may have moved, or you may not have access.</p>
        <p>
          <Link href="/">Go home</Link>
        </p>
      </div>
    </div>
  );
}
