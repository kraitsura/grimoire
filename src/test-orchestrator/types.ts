// Shared types for test orchestrator

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface Order {
  id: string;
  userId: string;
  products: Array<{ productId: string; quantity: number }>;
  total: number;
  createdAt: Date;
}

export interface OrderItem {
  productId: string;
  quantity: number;
}
