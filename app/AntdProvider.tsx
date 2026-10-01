"use client";

import { App as AntdApp, ConfigProvider, theme } from "antd";

export default function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#cc785c",
          colorBgBase: "#262624",
          colorBgContainer: "#2d2c2a",
          colorBgElevated: "#37352f",
          colorBorder: "#46443e",
          colorBorderSecondary: "#3a3834",
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
