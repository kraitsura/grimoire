// UserService - in-memory CRUD implementation
import type { User } from "./types";

export class UserService {
  private users: Map<string, User> = new Map();

  createUser(data: Omit<User, "id" | "createdAt">): User {
    const id = crypto.randomUUID();
    const user: User = {
      id,
      ...data,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  updateUser(id: string, data: Partial<Omit<User, "id" | "createdAt">>): User | undefined {
    const existing = this.users.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: User = {
      ...existing,
      ...data,
    };
    this.users.set(id, updated);
    return updated;
  }

  deleteUser(id: string): boolean {
    return this.users.delete(id);
  }
}
