import { useTranslations } from "next-intl";
/** Original vector illustrations keep the visual language consistent without external assets. */
export function MarketArt({ variant = "market", className = "" }: { variant?: "market" | "coffee" | "craft" | "grow"; className?: string }) {
  const t = useTranslations("ui");

  if (variant === "coffee") return (
    <svg viewBox="0 0 400 280" fill="none" aria-hidden="true" className={className}>
      <circle cx="205" cy="142" r="104" fill="#E5DCC9" />
      <path d="M87 225c27-42 52-64 95-72M293 84c-18 5-31 21-38 48" stroke="#466B4A" strokeWidth="4" />
      <ellipse cx="106" cy="199" rx="15" ry="30" transform="rotate(-42 106 199)" fill="#527B50" /><ellipse cx="145" cy="173" rx="14" ry="29" transform="rotate(32 145 173)" fill="#78956A" />
      <path d="m168 58 101 13-14 149-122-15 21-125 14-22Z" fill="#B36B45" /><path d="m168 58 101 13-12 21-103-12 14-22Z" fill="#D9986F" />
      <path d="m159 118 87 11-7 58-89-11 9-58Z" fill="#FFF8EA" /><text x="173" y="145" fill="#355B43" fontSize="13" fontFamily="sans-serif" fontWeight="700" transform="rotate(7 173 145)">{t("good")}</text><text x="163" y="165" fill="#355B43" fontSize="16" fontFamily="sans-serif" fontWeight="700" transform="rotate(7 163 165)">{t("coffee")}</text>
      <ellipse cx="286" cy="214" rx="32" ry="12" fill="#355B43" /><path d="M259 192h52v21c0 24-52 24-52 0v-21Z" fill="#F9F5E9" /><ellipse cx="285" cy="192" rx="26" ry="9" fill="#6B4430" /><path d="M311 196c25-5 25 23 0 20" stroke="#F9F5E9" strokeWidth="8" />
      <path d="M282 169c-12-12 11-13 0-26" stroke="#AAA789" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (variant === "craft") return (
    <svg viewBox="0 0 400 280" fill="none" aria-hidden="true" className={className}>
      <circle cx="200" cy="143" r="106" fill="#EACDB8" /><path d="M180 84c-2-37 44-37 42 0l-6 21c45 25 49 55 40 91-9 35-108 35-117 0-9-36-3-66 47-91l-6-21Z" fill="#AF6247" /><ellipse cx="201" cy="83" rx="22" ry="6" fill="#7C4839" />
      <path d="M140 160h118M139 175h119M144 190h109" stroke="#D9936E" strokeWidth="5" /><path d="M200 61c-1-26 3-44 19-58M202 61c-29-12-37-28-37-42M202 58c29-7 38-19 42-34" stroke="#426A4C" strokeWidth="4" />
      <ellipse cx="165" cy="20" rx="10" ry="24" transform="rotate(-30 165 20)" fill="#6D8D60" /><ellipse cx="243" cy="28" rx="10" ry="24" transform="rotate(40 243 28)" fill="#355D43" /><ellipse cx="219" cy="7" rx="10" ry="24" transform="rotate(20 219 7)" fill="#72956A" />
      <path d="M83 212h62l-7 18H90l-7-18Z" fill="#F8F0DE" /><ellipse cx="114" cy="212" rx="31" ry="8" fill="#D6BC9B" /><path d="M273 211h62l-7 18h-48l-7-18Z" fill="#527562" /><ellipse cx="304" cy="211" rx="31" ry="8" fill="#345A43" />
    </svg>
  );
  if (variant === "grow") return (
    <svg viewBox="0 0 400 280" fill="none" aria-hidden="true" className={className}>
      <circle cx="200" cy="139" r="105" fill="#CDD9BE" /><path d="M200 196V65m0 87-43-42m43 12 43-37" stroke="#41664A" strokeWidth="5" />
      <ellipse cx="158" cy="105" rx="18" ry="36" transform="rotate(-45 158 105)" fill="#567A4B" /><ellipse cx="243" cy="82" rx="18" ry="36" transform="rotate(45 243 82)" fill="#416449" /><ellipse cx="202" cy="59" rx="16" ry="31" fill="#78955F" />
      <path d="M149 172h104l-17 68h-70l-17-68Z" fill="#C57D55" /><path d="M143 170h116v17H143z" fill="#E2A275" /><path d="M170 196h61" stroke="#D99A70" strokeWidth="3" /><path d="M90 214c20-25 36-26 51-24M267 190c22-13 39-6 49 10" stroke="#6D8D60" strokeWidth="4" />
    </svg>
  );
  return (
    <svg viewBox="0 0 560 480" fill="none" aria-hidden="true" className={className}>
      <circle cx="285" cy="239" r="197" fill="#E4EBCF" />
      <path d="M112 371c62-31 270-33 338 0" stroke="#C5D1AC" strokeWidth="2" />
      <path d="M191 229c-23-138 179-143 154 0" stroke="#A96E45" strokeWidth="14" />
      <path d="M158 235h224l-24 129c-4 23-172 23-176 0l-24-129Z" fill="#C9955C" />
      <path d="M167 263h207M172 287h198M176 311h189M181 335h180M196 240l14 121m20-121 7 127m28-127v131m26-131-5 131m32-131-10 127m36-127-15 121" stroke="#A96E45" strokeWidth="5" />
      <path d="m161 236-33-83 60-25 43 107" fill="#FAF4DA" /><path d="m138 157 44-18 8 21-44 18Z" fill="#DBA05B" /><path d="m153 190 43-17 14 35-43 17Z" fill="#355E47" /><path d="m165 196 25-9m-21 18 25-9" stroke="#FAF4DA" strokeWidth="3" />
      <path d="M300 232c-6-45 18-68 46-79" stroke="#3D6649" strokeWidth="5" /><ellipse cx="337" cy="164" rx="17" ry="40" transform="rotate(47 337 164)" fill="#4B7450" /><ellipse cx="310" cy="190" rx="17" ry="37" transform="rotate(-32 310 190)" fill="#77925A" /><ellipse cx="365" cy="194" rx="16" ry="38" transform="rotate(62 365 194)" fill="#456C49" />
      <path d="m214 226 13-76c5-35 47-40 55-10l16 86" fill="#C0784F" /><path d="m241 153 18-10m-24 30 30-15m-34 36 39-19m-43 38 50-22" stroke="#E8B58A" strokeWidth="6" strokeLinecap="round" />
      <circle cx="323" cy="238" r="29" fill="#D57850" /><circle cx="352" cy="238" r="22" fill="#E6AB59" /><path d="M322 211c-7-12-1-20 10-23" stroke="#426748" strokeWidth="4" /><path d="M315 207c-14-12-24-9-28-2 12 11 21 12 28 2Z" fill="#527B50" />
      <path d="M155 232h230v20H155z" fill="#D9AE77" />
      <circle cx="415" cy="104" r="24" fill="#F0BC69" /><path d="m415 93 3 8 9 3-9 3-3 8-3-8-8-3 8-3 3-8Z" fill="#FFF9ED" />
      <path d="m114 272-14 7m18-60-14-6M396 315l11 5" stroke="#8EA174" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
