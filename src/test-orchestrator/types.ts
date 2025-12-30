// Shared types for test-orchestrator module

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  inStock: boolean;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: "pending" | "confirmed" | "shipped" | "delivered";
  createdAt: Date;
}
