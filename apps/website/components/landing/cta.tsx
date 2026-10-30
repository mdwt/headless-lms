import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { CopyCommand } from "@/components/copy-command";
import { Backdrop } from "@/components/landing/backdrop";

export function Cta() {
  return (
    <section className="px-2 pt-28 pb-2 md:px-3 md:pt-40 md:pb-3">
      <div className="relative isolate overflow-hidden rounded-[22px] md:rounded-[28px]">
        <Backdrop
          name="dusk"
          sizes="100vw"
          className="-z-10"
          style={{ objectPosition: "50% 40%" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(55%_58%_at_50%_52%,rgb(255_246_238/0.72),rgb(255_246_238/0.25)_70%,transparent_95%)]"
        />
        <div className="container-page flex flex-col items-center py-24 text-center md:py-36">
          <LogoMark className="size-12 text-[#2a1a14]" />
          <h2 className="mt-8 max-w-[16ch] text-[38px] leading-[1.02] font-semibold tracking-[-0.045em] text-balance text-[#2a1a14] md:text-[64px]">
            Spin up your own LMS in one command.
          </h2>
          <p className="mt-5 max-w-[500px] text-[17px] leading-[1.55] text-[#2a1a14]/75 md:text-[18.5px]">
            A standalone installation that owns its config and plugins, and deploys anywhere Node
            and Postgres run.
          </p>
          <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/docs"
              className="inline-flex h-[46px] items-center gap-2 rounded-[6px] bg-[#1a100c] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#1a100c]/85"
            >
              Get started
              <ArrowRight className="size-4" />
            </Link>
            <CopyCommand tone="warm" className="h-[46px] w-full max-w-[360px] text-left" />
          </div>
        </div>
      </div>
    </section>
  );
}
