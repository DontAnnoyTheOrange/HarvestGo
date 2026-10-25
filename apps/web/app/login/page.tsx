import type { Metadata } from 'next';
import Image from 'next/image';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = { title: 'Log in | HarvestGo' };

const ACCENT = '#86CB6F';

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1F4316]">
      <style>{`
  @keyframes hg-float {
    0% { transform: scale(1.1) translate3d(-4%, 0, 0); }
    100% { transform: scale(1.1) translate3d(4%, 0, 0); }
  }
  .hg-float { animation: hg-float 25s ease-in-out infinite alternate; will-change: transform; }
  .hg-card input { border-color: #CFE0C2; }
  .hg-card input:focus {
    outline: none;
    border-color: #86CB6F;
    box-shadow: 0 0 0 2px #86CB6F;
  }
`}</style>

      <Image
        src="/kabutihanfarm.jpg"
        alt=""
        fill
        sizes="100vw"
        className="hg-float object-cover"
        priority
      />

      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(20,45,14,0.68) 0%, rgba(20,45,14,0.72) 60%, rgba(14,32,10,0.9) 100%)',
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-8 px-6 py-10 sm:px-10 lg:flex-row lg:justify-between lg:gap-16">
        <section className="flex w-full max-w-lg flex-col gap-4 lg:-translate-y-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-7xl">
              Harvest<span style={{ color: ACCENT }}>Go</span>
            </h1>
            <p className="mt-2 text-sm font-medium uppercase tracking-[0.2em] text-[#E6EFDD]">
              For Kabutihan Farm
            </p>
          </div>
          <p className="hidden text-lg leading-relaxed text-[#EEF4E8] lg:block">
            Record harvests, sales and seminars as they happen. HarvestGo compiles them into your quarterly DA-ATI RTC IV-A report.
          </p>
        </section>

        <section className="w-full max-w-md">
          <div className="hg-card rounded-2xl bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-semibold text-[#1E2A18]">Log in</h2>
            <p className="mb-5 mt-1 text-sm text-[#5B6654]">Sign in to your account</p>
            <LoginForm />
            <p className="mt-5 text-sm text-[#5B6654]">
              No account? Ask the General Manager to create one for you.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}