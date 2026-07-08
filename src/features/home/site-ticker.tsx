import { companyTickerMessages } from "@/config/company";

export function SiteTicker() {
  return (
    <aside
      aria-label="Informations officielles Eben Ezer Business"
      className="fixed inset-x-0 bottom-0 z-[60] overflow-hidden border-t border-cyan-300/30 bg-[#06111F] text-white shadow-[0_-18px_60px_rgba(6,17,31,0.45)]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,#06111F_0%,rgba(56,189,248,0.34)_42%,rgba(163,230,53,0.24)_72%,#06111F_100%)]"
      />
      <div className="relative flex whitespace-nowrap py-2.5 text-sm font-semibold tracking-normal sm:py-3 sm:text-base">
        <div className="flex min-w-max animate-marquee items-center">
          <TickerMessageGroup />
          <TickerMessageGroup ariaHidden />
        </div>
      </div>
    </aside>
  );
}

function TickerMessageGroup({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div aria-hidden={ariaHidden} className="flex min-w-max items-center gap-8 px-4 sm:gap-10 sm:px-5">
      {companyTickerMessages.map((message) => (
        <span key={message} className="inline-flex items-center text-white drop-shadow-sm">
          {message}
        </span>
      ))}
    </div>
  );
}
