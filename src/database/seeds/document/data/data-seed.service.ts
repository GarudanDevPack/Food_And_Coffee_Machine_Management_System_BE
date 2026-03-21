import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { UserSchemaClass } from '../../../../users/infrastructure/persistence/document/entities/user.schema';
import { Machine } from '../../../../machines/schemas/machine.schema';
import { Item } from '../../../../items/schemas/item.schema';
import { Organization } from '../../../../organizations/schemas/organization.schema';

@Injectable()
export class DataSeedService {
  constructor(
    @InjectModel(UserSchemaClass.name)
    private readonly userModel: Model<UserSchemaClass>,
    @InjectModel(Machine.name)
    private readonly machineModel: Model<Machine>,
    @InjectModel(Item.name)
    private readonly itemModel: Model<Item>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
  ) {}

  async run() {
    const salt = await bcrypt.genSalt();
    const password = await bcrypt.hash('secret', salt);

    // ── 1. Client user (role=3) ───────────────────────────────────────────────
    let client = await this.userModel.findOne({ email: 'client@qfox.com' });
    if (!client) {
      client = await this.userModel.create({
        email: 'client@qfox.com',
        password,
        firstName: 'QFOX',
        lastName: 'Client',
        phone: '+94771234567',
        role: { _id: '3' },
        status: { _id: '1' },
      });
      console.log('✔ Client user seeded:', client._id.toString());
    }
    const clientId = client._id.toString();

    // ── 2. Agent users (role=4) ───────────────────────────────────────────────
    let agent1 = await this.userModel.findOne({ email: 'agent1@qfox.com' });
    if (!agent1) {
      agent1 = await this.userModel.create({
        email: 'agent1@qfox.com',
        password,
        firstName: 'Nimal',
        lastName: 'Perera',
        phone: '+94779876543',
        role: { _id: '4' },
        status: { _id: '1' },
      });
      console.log('✔ Agent1 seeded:', agent1._id.toString());
    }
    const agent1Id = agent1._id.toString();

    let agent2 = await this.userModel.findOne({ email: 'agent2@qfox.com' });
    if (!agent2) {
      agent2 = await this.userModel.create({
        email: 'agent2@qfox.com',
        password,
        firstName: 'Kasun',
        lastName: 'Silva',
        phone: '+94771112233',
        role: { _id: '4' },
        status: { _id: '1' },
      });
      console.log('✔ Agent2 seeded:', agent2._id.toString());
    }
    const agent2Id = agent2._id.toString();

    // ── 3. Items ─────────────────────────────────────────────────────────────
    const coffeeItems = [
      {
        name: 'Espresso',
        category: 'Hot Drinks',
        itemType: 'coffee' as const,
        description: 'Rich and bold espresso shot',
        cupSizes: [
          {
            size: 'small',
            price: 150,
            timerOfPowder: 3000,
            timerOfWater: 5000,
          },
          {
            size: 'medium',
            price: 200,
            timerOfPowder: 4000,
            timerOfWater: 7000,
          },
          {
            size: 'large',
            price: 250,
            timerOfPowder: 5000,
            timerOfWater: 9000,
          },
        ],
        isAvailable: true,
        totalRating: 45,
        ratingCount: 10,
        bayesianRating: 4.5,
      },
      {
        name: 'Cappuccino',
        category: 'Hot Drinks',
        itemType: 'coffee' as const,
        description: 'Creamy cappuccino with milk foam',
        cupSizes: [
          {
            size: 'small',
            price: 180,
            timerOfPowder: 3000,
            timerOfWater: 5000,
          },
          {
            size: 'medium',
            price: 230,
            timerOfPowder: 4000,
            timerOfWater: 7000,
          },
          {
            size: 'large',
            price: 280,
            timerOfPowder: 5000,
            timerOfWater: 9000,
          },
        ],
        isAvailable: true,
        totalRating: 40,
        ratingCount: 9,
        bayesianRating: 4.4,
      },
      {
        name: 'Latte',
        category: 'Hot Drinks',
        itemType: 'coffee' as const,
        description: 'Smooth latte with steamed milk',
        cupSizes: [
          {
            size: 'small',
            price: 200,
            timerOfPowder: 3000,
            timerOfWater: 6000,
          },
          {
            size: 'medium',
            price: 250,
            timerOfPowder: 4000,
            timerOfWater: 8000,
          },
          {
            size: 'large',
            price: 300,
            timerOfPowder: 5000,
            timerOfWater: 10000,
          },
        ],
        isAvailable: true,
        totalRating: 38,
        ratingCount: 8,
        bayesianRating: 4.75,
      },
      {
        name: 'Hot Chocolate',
        category: 'Hot Drinks',
        itemType: 'coffee' as const,
        description: 'Rich hot chocolate',
        cupSizes: [
          {
            size: 'small',
            price: 160,
            timerOfPowder: 2500,
            timerOfWater: 5000,
          },
          {
            size: 'medium',
            price: 210,
            timerOfPowder: 3500,
            timerOfWater: 7000,
          },
        ],
        isAvailable: true,
        totalRating: 30,
        ratingCount: 7,
        bayesianRating: 4.28,
      },
    ];

    const foodItems = [
      {
        name: 'Cheese Sandwich',
        category: 'Snacks',
        itemType: 'food' as const,
        description: 'Fresh cheese sandwich',
        unitPrice: 350,
        isAvailable: true,
        totalRating: 20,
        ratingCount: 5,
        bayesianRating: 4.0,
      },
      {
        name: 'Chocolate Bar',
        category: 'Snacks',
        itemType: 'food' as const,
        description: 'Premium milk chocolate bar',
        unitPrice: 120,
        isAvailable: true,
        totalRating: 25,
        ratingCount: 6,
        bayesianRating: 4.16,
      },
    ];

    const seededItems: { [key: string]: string } = {};
    for (const item of [...coffeeItems, ...foodItems]) {
      const existing = await this.itemModel.findOne({ name: item.name });
      if (!existing) {
        const created = await this.itemModel.create(item);
        seededItems[item.name] = created._id.toString();
        console.log(`✔ Item seeded: ${item.name}`);
      } else {
        seededItems[item.name] = existing._id.toString();
      }
    }

    // ── 4. Machines ──────────────────────────────────────────────────────────
    const machines = [
      {
        machineId: 'MCH-001',
        name: 'Coffee Station Alpha',
        machineType: 'coffee',
        location: 'Ground Floor, Block A',
        clientId,
        agentId: agent1Id,
        status: 'active',
        isOnline: true,
        totalOrders: 142,
        totalRevenue: 28400,
        inventory: [
          {
            itemId: seededItems['Espresso'],
            currentStock: 500,
            minStock: 50,
            nozzle: 1,
            gramsPerCup: 18,
          },
          {
            itemId: seededItems['Cappuccino'],
            currentStock: 320,
            minStock: 50,
            nozzle: 2,
            gramsPerCup: 20,
          },
          {
            itemId: seededItems['Latte'],
            currentStock: 80,
            minStock: 50,
            nozzle: 3,
            gramsPerCup: 22,
          },
        ],
        sensor: {
          temp: 92,
          water: 'full',
          powderlevel: [
            { canister: 1, level: 85 },
            { canister: 2, level: 60 },
          ],
        },
      },
      {
        machineId: 'MCH-002',
        name: 'Coffee Station Beta',
        machineType: 'coffee',
        location: '2nd Floor, Library',
        clientId,
        agentId: agent2Id,
        status: 'active',
        isOnline: false,
        totalOrders: 87,
        totalRevenue: 15660,
        inventory: [
          {
            itemId: seededItems['Espresso'],
            currentStock: 200,
            minStock: 50,
            nozzle: 1,
            gramsPerCup: 18,
          },
          {
            itemId: seededItems['Hot Chocolate'],
            currentStock: 30,
            minStock: 50,
            nozzle: 2,
            gramsPerCup: 25,
          },
        ],
        sensor: {
          temp: 0,
          water: 'low',
          powderlevel: [
            { canister: 1, level: 40 },
            { canister: 2, level: 15 },
          ],
        },
      },
      {
        machineId: 'MCH-003',
        name: 'Snack Vending Pro',
        machineType: 'food',
        location: 'Canteen, Block B',
        clientId,
        agentId: agent1Id,
        status: 'active',
        isOnline: true,
        totalOrders: 55,
        totalRevenue: 19250,
        batches: [
          {
            batchId: 'BAT-001',
            itemId: seededItems['Cheese Sandwich'],
            itemName: 'Cheese Sandwich',
            nozzleId: 1,
            quantity: 12,
            totalQty: 20,
            expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            loadedAt: new Date(),
            loadedBy: agent1Id,
            status: 'active',
          },
          {
            batchId: 'BAT-002',
            itemId: seededItems['Chocolate Bar'],
            itemName: 'Chocolate Bar',
            nozzleId: 2,
            quantity: 30,
            totalQty: 50,
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            loadedAt: new Date(),
            loadedBy: agent1Id,
            status: 'active',
          },
        ],
      },
      {
        machineId: 'MCH-004',
        name: 'Snack Vending Lite',
        machineType: 'food',
        location: 'Reception, Block A',
        clientId,
        agentId: agent2Id,
        status: 'maintenance',
        isOnline: false,
        totalOrders: 12,
        totalRevenue: 4200,
        batches: [],
      },
    ];

    const seededMachineIds: string[] = [];
    for (const m of machines) {
      const existing = await this.machineModel.findOne({
        machineId: m.machineId,
      });
      if (!existing) {
        await this.machineModel.create(m);
        console.log(`✔ Machine seeded: ${m.machineId} (${m.name})`);
      }
      seededMachineIds.push(m.machineId);
    }

    // ── 5. Organizations ─────────────────────────────────────────────────────
    const org1Exists = await this.orgModel.findOne({ orgId: 'ORG-001' });
    if (!org1Exists) {
      await this.orgModel.create({
        orgId: 'ORG-001',
        name: 'QFOX Colombo Hub',
        address: '45, Galle Road, Colombo 03',
        phone: '+94112345678',
        email: 'colombo@qfox.com',
        clientUserId: clientId,
        agentIds: [agent1Id, agent2Id],
        machineIds: ['MCH-001', 'MCH-002', 'MCH-003', 'MCH-004'],
        isActive: true,
        contractStart: new Date('2024-01-01'),
        contractEnd: new Date('2026-12-31'),
        notes: 'Main hub for Colombo region',
      });
      console.log('✔ Organization seeded: ORG-001');
    }

    console.log('\n✅ Dummy data seeding complete!');
    console.log('   Login credentials (password: secret)');
    console.log('   admin@example.com  — Super Admin');
    console.log('   client@qfox.com    — Client');
    console.log('   agent1@qfox.com    — Agent (Nimal Perera)');
    console.log('   agent2@qfox.com    — Agent (Kasun Silva)');
  }
}
