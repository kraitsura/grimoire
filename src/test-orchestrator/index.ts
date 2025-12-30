// Barrel export - to be enhanced by headless agent

export * from "./types";
export { UserService } from "./user-service";
export { ProductService } from "./product-service";
export { OrderService } from "./order-service";

/**
 * Factory function to create and return all service instances
 * @returns Object containing instantiated UserService, ProductService, and OrderService
 */
export function createServices() {
  return {
    userService: new UserService(),
    productService: new ProductService(),
    orderService: new OrderService(),
  };
}
