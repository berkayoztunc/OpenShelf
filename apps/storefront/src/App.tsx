import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { CartProvider } from "./cart/CartContext";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Listing from "./pages/Listing";
import Product from "./pages/Product";
import NotFound from "./pages/NotFound";

// Heavier / less-visited routes are split out.
const CartPage = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Order = lazy(() => import("./pages/Order"));
const Legal = lazy(() => import("./pages/Legal"));

export default function App() {
  return (
    <CartProvider>
      <Suspense fallback={<div className="container-x py-16"><div className="skeleton h-40" /></div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="products" element={<Listing />} />
            <Route path="category/:slug" element={<Listing />} />
            <Route path="product/:slug" element={<Product />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="order/:number" element={<Order />} />
            <Route path="legal/:key" element={<Legal />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </CartProvider>
  );
}
