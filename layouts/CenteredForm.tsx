import useLocalSettingsStore from "@/store/localSettings";
import Image from "next/image";
import Link from "next/link";
import React, { ReactNode } from "react";
import { Trans } from "next-i18next";

interface Props {
  text?: string;
  children: ReactNode;
  "data-testid"?: string;
}

export default function CenteredForm({
  text,
  children,
  "data-testid": dataTestId,
}: Props) {
  const { settings } = useLocalSettingsStore();

  // 환경변수에서 로고 경로 가져오기
  const logoSrc = settings.theme === "dark" 
    ? process.env.NEXT_PUBLIC_LOGO_DARK || "/default_logo_white.png"
    : process.env.NEXT_PUBLIC_LOGO_LIGHT || "/default_logo_dark.png";

  return (
    <div
      className="absolute top-0 bottom-0 left-0 right-0 flex justify-center items-center p-5"
      data-testid={dataTestId}
    >
      <div className="m-auto flex flex-col gap-2 w-full">
        <Image
          src={logoSrc}
          width={640}
          height={136}
          alt="Linkwarden"
          className="h-9 w-fit mx-auto"
        />
        {text && (
          <p className="text-lg max-w-[30rem] min-w-80 w-full mx-auto font-semibold px-2 text-center">
            {text}
          </p>
        )}
        {children}
        <p className="text-center text-xs text-neutral mb-5">
          <Trans
            values={{ date: new Date().getFullYear() }}
            i18nKey="all_rights_reserved"
            components={[
              <Link href="https://linkwarden.app" className="font-semibold" />,
            ]}
          />
        </p>
      </div>
    </div>
  );
}
