import type { User } from "./types";

// UserService with CRUD operations
export class UserService {
  private users: Map<string, User> = new Map();

  /**
   * Create a new user
   */
  createUser(user: User): User {
    if (this.users.has(user.id)) {
      throw new Error(`User with id ${user.id} already exists`);
    }
    this.users.set(user.id, user);
    return user;
  }

  /**
   * Get a user by ID
   */
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * Update an existing user
   */
  updateUser(id: string, updates: Partial<Omit<User, 'id'>>): User {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  /**
   * Delete a user by ID
   */
  deleteUser(id: string): boolean {
    return this.users.delete(id);
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Clear all users (useful for testing)
   */
  clear(): void {
    this.users.clear();
  }
}
