import type { Product } from "./types";

export class ProductService {
  private products: Map<string, Product> = new Map();

  createProduct(data: Omit<Product, "id">): Product {
    const id = `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const product: Product = {
      id,
      ...data,
    };
    this.products.set(id, product);
    return product;
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  listProducts(): Product[] {
    return Array.from(this.products.values());
  }

  updateProduct(id: string, data: Partial<Omit<Product, "id">>): Product | undefined {
    const product = this.products.get(id);
    if (!product) {
      return undefined;
    }
    const updatedProduct = { ...product, ...data };
    this.products.set(id, updatedProduct);
    return updatedProduct;
  }

  deleteProduct(id: string): boolean {
    return this.products.delete(id);
  }
}
