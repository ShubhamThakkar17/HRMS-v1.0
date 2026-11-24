import Link from 'next/link';

export const metadata = { title: 'Privacy notice' };

export default function Privacy() {
  return (
    <div className="mx-auto grid max-w-3xl gap-5 px-4 py-10">
      <div>
        <div className="text-[15px] font-bold tracking-[0.18em] text-brand">SILVER TOUCH</div>
        <h1 className="mt-2">HRMS privacy notice</h1>
        <p className="mt-1 text-muted">
          Version location-v1 / face-v1, November 2026. Written for India’s Digital Personal Data Protection
          Act, 2023 and the DPDP Rules, 2025.
        </p>
      </div>
      <section className="card grid gap-2">
        <h2>What we collect and why</h2>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <b>Employment records</b> (name, contact details, department, manager, join date, CTC) to run HR,
            payroll and approvals.
          </li>
          <li>
            <b>Attendance punches</b>: time and method of each check-in and check-out.
          </li>
          <li>
            <b>Location</b>, only at the moment you punch with GPS or Face ID: latitude, longitude, GPS
            accuracy and the distance to the nearest office. We never track location at any other time.
          </li>
          <li>
            <b>Face template</b>, only if you enrol in Face ID: up to three lists of 128 numbers computed on
            your own device. No photo is sent to or stored on our servers.
          </li>
          <li>
            <b>Leave, attendance corrections and expense claims</b>, including receipts you upload.
          </li>
        </ul>
      </section>
      <section className="card grid gap-2">
        <h2>How it is protected</h2>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Data is stored in a PostgreSQL database in India. Face templates are encrypted with AES-256-GCM.
          </li>
          <li>
            Each person sees only what their role allows. Every change to HR data is recorded in an audit log.
          </li>
          <li>
            Receipts are visible only to you, your manager, Finance and HR administrators, through links that
            expire after five minutes.
          </li>
          <li>The nightly Google Sheets backup never includes face templates or secrets.</li>
        </ul>
      </section>
      <section className="card grid gap-2">
        <h2>How long we keep it</h2>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Precise punch coordinates are deleted after the retention period set by HR (90 days by default).
            The office and distance are kept as part of your attendance record.
          </li>
          <li>
            Your face template is kept while you use Face ID and is deleted the moment you withdraw consent.
          </li>
          <li>
            Employment and attendance records are kept as long as employment and statutory record-keeping
            require.
          </li>
        </ul>
      </section>
      <section className="card grid gap-2">
        <h2>Your choices and rights</h2>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Face ID is optional. You can always punch with the office kiosk code, your location or the web
            punch.
          </li>
          <li>
            Withdraw Face ID consent at any time under My profile; your template is deleted immediately.
          </li>
          <li>
            Download all your data as a file under My profile. Ask HR to correct anything that is wrong.
          </li>
          <li>For questions or grievances, contact the HR team or the company’s grievance officer.</li>
        </ul>
      </section>
      <p>
        <Link href="/">Back to the HRMS</Link>
      </p>
    </div>
  );
}
