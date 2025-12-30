import { describe, test, expect } from "bun:test";
import type { User, Product, OrderItem, Order } from "../types";

/**
 * Types Test Suite
 * Tests that types from the test-orchestrator module can be imported and used correctly.
 */

describe("User type", () => {
  test("should create a valid User object", () => {
    const user: User = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      createdAt: new Date("2025-01-01"),
    };

    expect(user.id).toBe("user-123");
    expect(user.email).toBe("test@example.com");
    expect(user.name).toBe("Test User");
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  test("should support User with current timestamp", () => {
    const now = new Date();
    const user: User = {
      id: "user-456",
      email: "another@example.com",
      name: "Another User",
      createdAt: now,
    };

    expect(user.createdAt.getTime()).toBe(now.getTime());
  });
});

describe("Product type", () => {
  test("should create a valid Product object", () => {
    const product: Product = {
      id: "prod-001",
      name: "Test Product",
      price: 29.99,
      description: "A great product for testing",
      inStock: true,
    };

    expect(product.id).toBe("prod-001");
    expect(product.name).toBe("Test Product");
    expect(product.price).toBe(29.99);
    expect(product.description).toBe("A great product for testing");
    expect(product.inStock).toBe(true);
  });

  test("should handle out of stock product", () => {
    const product: Product = {
      id: "prod-002",
      name: "Out of Stock Item",
      price: 0,
      description: "",
      inStock: false,
    };

    expect(product.inStock).toBe(false);
    expect(product.price).toBe(0);
  });

  test("should handle product with decimal price", () => {
    const product: Product = {
      id: "prod-003",
      name: "Precision Item",
      price: 123.456,
      description: "Testing price precision",
      inStock: true,
    };

    expect(product.price).toBeCloseTo(123.456);
  });
});

describe("OrderItem type", () => {
  test("should create a valid OrderItem", () => {
    const item: OrderItem = {
      productId: "prod-001",
      quantity: 3,
      unitPrice: 19.99,
    };

    expect(item.productId).toBe("prod-001");
    expect(item.quantity).toBe(3);
    expect(item.unitPrice).toBe(19.99);
  });

  test("should calculate total from OrderItem properties", () => {
    const item: OrderItem = {
      productId: "prod-001",
      quantity: 5,
      unitPrice: 10.0,
    };

    const total = item.quantity * item.unitPrice;
    expect(total).toBe(50.0);
  });
});

describe("Order type", () => {
  test("should create a valid Order with pending status", () => {
    const order: Order = {
      id: "order-001",
      userId: "user-123",
      items: [
        { productId: "prod-001", quantity: 2, unitPrice: 25.0 },
        { productId: "prod-002", quantity: 1, unitPrice: 15.0 },
      ],
      status: "pending",
      createdAt: new Date("2025-01-15"),
    };

    expect(order.id).toBe("order-001");
    expect(order.userId).toBe("user-123");
    expect(order.items).toHaveLength(2);
    expect(order.status).toBe("pending");
  });

  test("should support all order statuses", () => {
    const statuses: Order["status"][] = ["pending", "confirmed", "shipped", "delivered"];

    statuses.forEach((status) => {
      const order: Order = {
        id: `order-${status}`,
        userId: "user-123",
        items: [],
        status,
        createdAt: new Date(),
      };

      expect(order.status).toBe(status);
    });
  });

  test("should handle order with empty items array", () => {
    const order: Order = {
      id: "order-empty",
      userId: "user-456",
      items: [],
      status: "pending",
      createdAt: new Date(),
    };

    expect(order.items).toHaveLength(0);
    expect(Array.isArray(order.items)).toBe(true);
  });

  test("should calculate order total from items", () => {
    const order: Order = {
      id: "order-total",
      userId: "user-789",
      items: [
        { productId: "prod-001", quantity: 2, unitPrice: 10.0 },
        { productId: "prod-002", quantity: 3, unitPrice: 5.0 },
      ],
      status: "confirmed",
      createdAt: new Date(),
    };

    const total = order.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
    expect(total).toBe(35.0);
  });
});

describe("Type relationships", () => {
  test("should link User to Order via userId", () => {
    const user: User = {
      id: "user-link-test",
      email: "link@example.com",
      name: "Link Test User",
      createdAt: new Date(),
    };

    const order: Order = {
      id: "order-link-test",
      userId: user.id,
      items: [],
      status: "pending",
      createdAt: new Date(),
    };

    expect(order.userId).toBe(user.id);
  });

  test("should link Product to OrderItem via productId", () => {
    const product: Product = {
      id: "prod-link-test",
      name: "Linked Product",
      price: 99.99,
      description: "For linking test",
      inStock: true,
    };

    const orderItem: OrderItem = {
      productId: product.id,
      quantity: 1,
      unitPrice: product.price,
    };

    expect(orderItem.productId).toBe(product.id);
    expect(orderItem.unitPrice).toBe(product.price);
  });
});
