import { kioskDisplay } from '@/server/services/kiosk';
import { KioskCode } from './kiosk-code';

export const metadata = { title: 'Office kiosk' };
export const dynamic = 'force-dynamic';

export default async function KioskPage({
  params,
  searchParams,
}: {
  params: Promise<{ deviceId: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { deviceId } = await params;
  const { k = '' } = await searchParams;
  const d = await kioskDisplay(deviceId, k);
  return (
    <div className="grid min-h-screen place-items-center bg-[#0b2e25] p-6 text-center text-white">
      {d ? (
        <div className="grid justify-items-center gap-3.5">
          <div className="text-[15px] font-bold tracking-[0.18em]">SILVER TOUCH</div>
          <div className="opacity-80">
            {d.office.name} · {d.name}
          </div>
          <KioskCode deviceId={deviceId} token={k} initial={{ code: d.code, secondsLeft: d.secondsLeft }} />
          <p className="max-w-[44ch] opacity-85">
            Open the HRMS on your phone, go to Punch in and out, and enter this code under Office code.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          <h1>Kiosk not available</h1>
          <p className="opacity-80">
            This device is not registered or has been revoked. Ask your Super Admin for a new kiosk link.
          </p>
        </div>
      )}
    </div>
  );
}
