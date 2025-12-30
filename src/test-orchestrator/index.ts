// Barrel exports
export * from "./types";
export { UserService } from "./user-service";
export { ProductService } from "./product-service";
export { OrderService } from "./order-service";

// Factory function to instantiate all services
export function createServices() {
  return {
    userService: new UserService(),
    productService: new ProductService(),
    orderService: new OrderService(),
  };
}
