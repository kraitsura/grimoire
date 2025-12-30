// Product service with CRUD operations
import type { Product } from "./types";

export class ProductService {
  private products: Map<string, Product>;

  constructor() {
    this.products = new Map();
  }

  createProduct(product: Product): Product {
    if (this.products.has(product.id)) {
      throw new Error(`Product with id ${product.id} already exists`);
    }
    this.products.set(product.id, product);
    return product;
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  listProducts(): Product[] {
    return Array.from(this.products.values());
  }

  updateInventory(id: string, inventory: number): Product {
    const product = this.products.get(id);
    if (!product) {
      throw new Error(`Product with id ${id} not found`);
    }
    if (inventory < 0) {
      throw new Error("Inventory cannot be negative");
    }
    const updatedProduct = { ...product, inventory };
    this.products.set(id, updatedProduct);
    return updatedProduct;
  }
}
