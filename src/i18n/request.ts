import { getRequestConfig } from "next-intl/server";
import { LOCALE } from "./config";

// next-intl entry point. Because we're single-locale today, we always
// return the zh-CN bundle. Adding English later = introduce a `[locale]`
// segment and branch here on `locale`.
export default getRequestConfig(async () => {
  const messages = (await import("../../messages/zh-CN.json")).default;
  return {
    locale: LOCALE,
    messages,
  };
});
