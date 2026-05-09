export interface ValidityView {
  status: "active" | "expired" | "unknown";
  label: string;
  exact: string;
}

export function getValidityView(value?: string): ValidityView {
  if (!value) {
    return {
      status: "unknown",
      label: "有效期未知",
      exact: ""
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      status: "unknown",
      label: "有效期未知",
      exact: ""
    };
  }

  const remainingDays = Math.ceil(
    (date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );

  return {
    status: remainingDays < 0 ? "expired" : "active",
    label: remainingDays < 0 ? "已过期" : `有效期 ${Math.max(remainingDays, 0)}天`,
    exact: formatExactDate(value)
  };
}

export function formatExactDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}`;
}
