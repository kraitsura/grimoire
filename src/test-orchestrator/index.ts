// Barrel export for test-orchestrator module
export * from "./types";
export { UserService } from "./user-service";
export { ProductService } from "./product-service";
export { OrderService } from "./order-service";

// Re-export types for convenience
import type { User, Product, Order, OrderItem } from "./types";
import { UserService } from "./user-service";
import { ProductService } from "./product-service";
import { OrderService } from "./order-service";

/** Services container returned by createServices() */
export interface Services {
  userService: UserService;
  productService: ProductService;
  orderService: OrderService;
}

/** Factory function to instantiate all services */
export function createServices(): Services {
  return {
    userService: new UserService(),
    productService: new ProductService(),
    orderService: new OrderService(),
  };
}
