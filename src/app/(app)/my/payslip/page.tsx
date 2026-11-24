import { requireUser } from '@/server/current-user';
import { payslipFor } from '@/server/services/payroll';
import { getSetting } from '@/server/settings';
import { businessDate, fmtMonth, isValidMonth } from '@/lib/dates';
import { PayslipView } from '@/components/payslip';
import { PrintButton } from '@/components/print-button';
import { Card, MonthNav, PageHead, Stack } from '@/components/ui';

export const metadata = { title: 'My payslip' };

export default async function MyPayslip({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const ym = sp.month && isValidMonth(sp.month) ? sp.month : businessDate().slice(0, 7);
  const [slip, company] = await Promise.all([payslipFor(user.id, ym), getSetting('company')]);
  return (
    <Stack>
      <PageHead
        title="My payslip"
        lead="A preview from your CTC and attendance. Your official payslip comes from the payroll provider."
        actions={
          <>
            <MonthNav ym={ym} label={fmtMonth(ym)} base="/my/payslip" />
            <PrintButton />
          </>
        }
      />
      <Card>
        <PayslipView slip={slip} company={company.name} />
      </Card>
    </Stack>
  );
}
