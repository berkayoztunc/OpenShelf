import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { LoginPage } from "./pages/Login";
import { SetupPage } from "./pages/Setup";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const ProductEdit = lazy(() => import("./pages/ProductEdit"));
const Categories = lazy(() => import("./pages/Categories"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Customers = lazy(() => import("./pages/Customers"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceEditor = lazy(() => import("./pages/InvoiceEditor"));
const Emails = lazy(() => import("./pages/Emails"));
const EmailCompose = lazy(() => import("./pages/EmailCompose"));
const PrintPage = lazy(() => import("./pages/print/PrintPage"));
const Coupons = lazy(() => import("./pages/Coupons"));
const Settings = lazy(() => import("./pages/settings/Settings"));
const Integrations = lazy(() => import("./pages/Integrations"));
const IntegrationEvents = lazy(() => import("./pages/IntegrationEvents"));
const MockInbox = lazy(() => import("./pages/MockInbox"));
const Security = lazy(() => import("./pages/Security"));
const Audit = lazy(() => import("./pages/Audit"));
const DataPage = lazy(() => import("./pages/Data"));
const Help = lazy(() => import("./pages/Help"));
const Trendyol = lazy(() => import("./pages/trendyol/Trendyol"));

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="print/:kind" element={<RequireAuth><PrintPage /></RequireAuth>} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductEdit />} />
          <Route path="products/:id" element={<ProductEdit />} />
          <Route path="categories" element={<Categories />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/new" element={<InvoiceEditor />} />
          <Route path="invoices/:id" element={<InvoiceEditor />} />
          <Route path="emails" element={<Emails />} />
          <Route path="emails/compose" element={<EmailCompose />} />
          <Route path="customers" element={<Customers />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="settings" element={<Navigate to="/settings/general" replace />} />
          <Route path="settings/integrations" element={<Navigate to="/integrations" replace />} />
          <Route path="settings/:tab" element={<Settings />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="integration-events" element={<IntegrationEvents />} />
          <Route path="mock-inbox" element={<MockInbox />} />
          <Route path="security" element={<Security />} />
          <Route path="audit" element={<Audit />} />
          <Route path="data" element={<DataPage />} />
          <Route path="trendyol/*" element={<Trendyol />} />
          <Route path="help" element={<Help />} />
          <Route path="help/:section" element={<Help />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
