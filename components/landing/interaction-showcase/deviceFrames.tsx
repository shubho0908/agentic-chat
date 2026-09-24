import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DeviceOrientation } from "@/components/landing/interaction-showcase/types";

const LAPTOP_FRAME = {
  border: "border-neutral-300 dark:border-[#26262c]",
  base: "bg-linear-to-b from-neutral-300 to-neutral-400 dark:from-[#34343c] dark:to-[#1c1c22]",
  notch: "bg-neutral-500 dark:bg-[#131318]",
} as const;

export function LaptopFrame({ children }: { children: ReactNode }) {
  return (
    <div data-slot="laptop-frame" className="flex w-full flex-col items-center">
      <div
        className={cn(
          "w-[88.89%] overflow-hidden rounded-t-xl border-2 border-b-0 shadow-xl",
          LAPTOP_FRAME.border,
        )}
      >
        <div className="bg-neutral-800 p-1.5 pb-0">
          <div className="relative aspect-[16/10] overflow-hidden rounded-t-lg bg-neutral-900">
            <div className="relative size-full overflow-hidden rounded-t-lg">
              {children}
            </div>
          </div>
        </div>
      </div>
      <div
        className={cn("relative h-2.5 w-full rounded-b-xl sm:h-3", LAPTOP_FRAME.base)}
      >
        <div
          aria-hidden="true"
          className={cn(
            "absolute left-1/2 top-0 h-1 w-14 -translate-x-1/2 rounded-b-md sm:w-16",
            LAPTOP_FRAME.notch,
          )}
        />
      </div>
    </div>
  );
}

const IPAD_ASPECT_PORTRAIT = "aspect-[178.5/247.6]";
const IPAD_ASPECT_LANDSCAPE = "aspect-[247.6/178.5]";

const IPAD_FRAME = {
  frame:
    "bg-linear-to-b from-[#f4f4f6] to-[#dcdce0] dark:from-[#45454a] dark:to-[#232326]",
  button: "bg-[#c9c9cd] dark:bg-[#141416]",
} as const;

function IpadEdgeButtons({ orientation }: { orientation: DeviceOrientation }) {
  if (orientation === DeviceOrientation.Landscape) {
    return (
      <>
        <div
          aria-hidden="true"
          className={cn(
            "absolute -top-[3px] left-[10%] h-[3px] w-[14%] rounded-t-[2px]",
            IPAD_FRAME.button,
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "absolute -top-[3px] right-[24%] h-[3px] w-[8%] rounded-t-[2px]",
            IPAD_FRAME.button,
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "absolute -top-[3px] right-[13%] h-[3px] w-[8%] rounded-t-[2px]",
            IPAD_FRAME.button,
          )}
        />
      </>
    );
  }

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "absolute -top-[3px] left-[13%] h-[3px] w-[9%] rounded-t-[2px]",
          IPAD_FRAME.button,
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "absolute -top-[3px] left-[24%] h-[3px] w-[9%] rounded-t-[2px]",
          IPAD_FRAME.button,
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "absolute -top-[3px] right-[16%] h-[3px] w-[16%] rounded-t-[2px]",
          IPAD_FRAME.button,
        )}
      />
    </>
  );
}

function IpadCamera({ orientation }: { orientation: DeviceOrientation }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute z-20 flex h-[7px] w-[7px] items-center justify-center rounded-full bg-[#151517] ring-[3px] ring-black/5",
        orientation === DeviceOrientation.Landscape
          ? "left-[10px] top-1/2 -translate-y-1/2"
          : "left-1/2 top-[10px] -translate-x-1/2",
      )}
    >
      <div className="h-[2.5px] w-[2.5px] rounded-full bg-[#3a4a5c]" />
    </div>
  );
}

export function IpadFrame({
  orientation = DeviceOrientation.Portrait,
  children,
}: {
  orientation?: DeviceOrientation;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="ipad-frame"
      data-orientation={orientation}
      className={cn(
        "relative w-full rounded-[2.1rem] p-[4px] shadow-2xl shadow-black/25 ring-1 ring-black/10 dark:ring-white/10",
        orientation === DeviceOrientation.Landscape ? IPAD_ASPECT_LANDSCAPE : IPAD_ASPECT_PORTRAIT,
        IPAD_FRAME.frame,
      )}
    >
      <IpadEdgeButtons orientation={orientation} />
      <div className="relative h-full w-full overflow-hidden rounded-[1.9rem] bg-black">
        <div className="absolute inset-[7px] overflow-hidden rounded-[1.5rem] bg-white dark:bg-[#0b0d11]">
          <div className="relative h-full w-full">{children}</div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-linear-to-tr from-white/0 via-white/[0.06] to-white/0"
          />
          <IpadCamera orientation={orientation} />
        </div>
      </div>
    </div>
  );
}


const PHONE_FRAME = {
  frame: "bg-[#9a9590] dark:bg-[#35322e]",
  button: "bg-[#8f8a85] dark:bg-[#282522]",
} as const;

function PhoneSideButtons() {
  const buttonClass = "absolute w-[2px] rounded-l-sm";
  return (
    <>
      <div
        aria-hidden="true"
        className={cn(buttonClass, "-left-[2px] top-[15.5%] h-[3.2%]", PHONE_FRAME.button)}
      />
      <div
        aria-hidden="true"
        className={cn(buttonClass, "-left-[2px] top-[21%] h-[7.2%]", PHONE_FRAME.button)}
      />
      <div
        aria-hidden="true"
        className={cn(buttonClass, "-left-[2px] top-[30.5%] h-[7.2%]", PHONE_FRAME.button)}
      />
      <div
        aria-hidden="true"
        className={cn(
          buttonClass,
          "-right-[2px] top-[23%] h-[11.5%] rounded-l-none rounded-r-sm",
          PHONE_FRAME.button,
        )}
      />
    </>
  );
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="phone-frame"
      className={cn(
        "relative aspect-[70.6/133] w-full rounded-[2.6rem] p-[2px] shadow-2xl shadow-black/25 ring-1 ring-black/10 dark:ring-white/10",
        PHONE_FRAME.frame,
      )}
    >
      <PhoneSideButtons />
      <div className="relative h-full w-full overflow-hidden rounded-[2.5rem] bg-black">
        <div className="absolute inset-[3.5px] overflow-hidden rounded-[2.3rem] bg-white dark:bg-[#0b0d11]">
          <div className="relative h-full w-full">{children}</div>
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-[9px] z-20 h-[20px] w-[66px] -translate-x-1/2 rounded-full bg-black"
          >
            <div
              aria-hidden="true"
              className="absolute right-[5px] top-1/2 block h-[8px] w-[8px] shrink-0 -translate-y-1/2 rounded-full bg-[#6a90c8]/20"
            />
          </div>
          <div
            aria-hidden="true"
            className="absolute bottom-[5.5px] left-1/2 z-20 h-[3px] w-[32%] -translate-x-1/2 rounded-full bg-black/20 dark:bg-white/20"
          />
        </div>
      </div>
    </div>
  );
}

