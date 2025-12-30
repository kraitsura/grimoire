// ProductService - CRUD operations for products
import type { Product } from "./types";

export class ProductService {
  private products: Map<string, Product> = new Map();

  createProduct(product: Product): Product {
    this.products.set(product.id, product);
    return product;
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  listProducts(): Product[] {
    return Array.from(this.products.values());
  }

  updateProduct(id: string, updates: Partial<Omit<Product, "id">>): Product | undefined {
    const existing = this.products.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.products.set(id, updated);
    return updated;
  }

  deleteProduct(id: string): boolean {
    return this.products.delete(id);
  }
}
