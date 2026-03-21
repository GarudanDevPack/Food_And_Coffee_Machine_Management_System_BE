import {
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CreateUserDto } from './dto/create-user.dto';
import { NullableType } from '../utils/types/nullable.type';
import { FilterUserDto, SortUserDto } from './dto/query-user.dto';
import { UserRepository } from './infrastructure/persistence/user.repository';
import { User } from './domain/user';
import bcrypt from 'bcryptjs';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { FilesService } from '../files/files.service';
import { RoleEnum } from '../roles/roles.enum';
import { StatusEnum } from '../statuses/statuses.enum';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { FileType } from '../files/domain/file';
import { Role } from '../roles/domain/role';
import { Status } from '../statuses/domain/status';
import { UpdateUserDto } from './dto/update-user.dto';
import { WalletService } from '../wallet/wallet.service';

/**
 * Generate a human-readable customer ID: CUS-YYYYMMDD-HHMMSS
 */
function generateCustomerId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `CUS-${date}-${time}`;
}

/**
 * Generate a unique wallet reference ID: wlt_<base36(timestamp)>_<random8hex>
 */
function generateWalletId(): string {
  const ts36 = Date.now().toString(36);
  const rand = randomBytes(4).toString('hex');
  return `wlt_${ts36}_${rand}`;
}

/**
 * Normalize Sri Lanka phone numbers to +94XXXXXXXXX format.
 * - "0771234567"  → "+94771234567"
 * - "94771234567" → "+94771234567"
 * - "+94771234567" → unchanged
 */
function normalizePhone(phone: string): string {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return '+94' + digits.slice(1);
  }
  if (digits.startsWith('94') && digits.length === 11) {
    return '+' + digits;
  }
  return phone;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UserRepository,
    private readonly filesService: FilesService,
    private readonly walletService: WalletService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Do not remove comment below.
    // <creating-property />

    let password: string | undefined = undefined;

    if (createUserDto.password) {
      const salt = await bcrypt.genSalt();
      password = await bcrypt.hash(createUserDto.password, salt);
    }

    let email: string | null = null;

    if (createUserDto.email) {
      const userObject = await this.usersRepository.findByEmail(
        createUserDto.email,
      );
      if (userObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'emailAlreadyExists',
          },
        });
      }
      email = createUserDto.email;
    }

    let photo: FileType | null | undefined = undefined;

    if (createUserDto.photo?.id) {
      const fileObject = await this.filesService.findById(
        createUserDto.photo.id,
      );
      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            photo: 'imageNotExists',
          },
        });
      }
      photo = fileObject;
    } else if (createUserDto.photo === null) {
      photo = null;
    }

    let role: Role | undefined = undefined;

    if (createUserDto.role?.id) {
      const roleObject = Object.values(RoleEnum)
        .map(String)
        .includes(String(createUserDto.role.id));
      if (!roleObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            role: 'roleNotExists',
          },
        });
      }

      role = {
        id: createUserDto.role.id,
      };
    }

    let status: Status | undefined = undefined;

    if (createUserDto.status?.id) {
      const statusObject = Object.values(StatusEnum)
        .map(String)
        .includes(String(createUserDto.status.id));
      if (!statusObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            status: 'statusNotExists',
          },
        });
      }

      status = {
        id: createUserDto.status.id,
      };
    }

    // Normalize phone if provided
    const phone = createUserDto.phone
      ? normalizePhone(createUserDto.phone)
      : null;

    // Determine if this is a customer being created
    const isCustomer =
      createUserDto.role?.id === RoleEnum.customer ||
      String(createUserDto.role?.id) === String(RoleEnum.customer);

    let customerId: string | null = null;
    let walletId: string | null = null;

    if (isCustomer) {
      customerId = generateCustomerId();
      walletId = generateWalletId();
    }

    const user = await this.usersRepository.create({
      // Do not remove comment below.
      // <creating-property-payload />
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName ?? null,
      email: email,
      password: password,
      photo: photo,
      role: role,
      status: status,
      provider: createUserDto.provider ?? AuthProvidersEnum.email,
      socialId: createUserDto.socialId,
      phone,
      customerId,
      walletId,
    });

    // Auto-create wallet for customers in the same request
    if (isCustomer && walletId) {
      await this.walletService.createWalletForCustomer(
        user.id as string,
        walletId,
      );
    }

    return user;
  }

  findManyWithPagination({
    filterOptions,
    sortOptions,
    paginationOptions,
  }: {
    filterOptions?: FilterUserDto | null;
    sortOptions?: SortUserDto[] | null;
    paginationOptions: IPaginationOptions;
  }): Promise<User[]> {
    return this.usersRepository.findManyWithPagination({
      filterOptions,
      sortOptions,
      paginationOptions,
    });
  }

  findById(id: User['id']): Promise<NullableType<User>> {
    return this.usersRepository.findById(id);
  }

  findByIds(ids: User['id'][]): Promise<User[]> {
    return this.usersRepository.findByIds(ids);
  }

  findByPhone(phone: string) {
    return this.usersRepository.findByPhone(phone);
  }

  findByCustomerId(customerId: string) {
    return this.usersRepository.findByCustomerId(customerId);
  }

  findByEmail(email: User['email']): Promise<NullableType<User>> {
    return this.usersRepository.findByEmail(email);
  }

  findBySocialIdAndProvider({
    socialId,
    provider,
  }: {
    socialId: User['socialId'];
    provider: User['provider'];
  }): Promise<NullableType<User>> {
    return this.usersRepository.findBySocialIdAndProvider({
      socialId,
      provider,
    });
  }

  async update(
    id: User['id'],
    updateUserDto: UpdateUserDto,
  ): Promise<User | null> {
    // Do not remove comment below.
    // <updating-property />

    let password: string | undefined = undefined;

    if (updateUserDto.password) {
      const userObject = await this.usersRepository.findById(id);

      if (userObject && userObject?.password !== updateUserDto.password) {
        const salt = await bcrypt.genSalt();
        password = await bcrypt.hash(updateUserDto.password, salt);
      }
    }

    let email: string | null | undefined = undefined;

    if (updateUserDto.email) {
      const userObject = await this.usersRepository.findByEmail(
        updateUserDto.email,
      );

      if (userObject && userObject.id !== id) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'emailAlreadyExists',
          },
        });
      }

      email = updateUserDto.email;
    } else if (updateUserDto.email === null) {
      email = null;
    }

    let photo: FileType | null | undefined = undefined;

    if (updateUserDto.photo?.id) {
      const fileObject = await this.filesService.findById(
        updateUserDto.photo.id,
      );
      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            photo: 'imageNotExists',
          },
        });
      }
      photo = fileObject;
    } else if (updateUserDto.photo === null) {
      photo = null;
    }

    let role: Role | undefined = undefined;

    if (updateUserDto.role?.id) {
      const roleObject = Object.values(RoleEnum)
        .map(String)
        .includes(String(updateUserDto.role.id));
      if (!roleObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            role: 'roleNotExists',
          },
        });
      }

      role = {
        id: updateUserDto.role.id,
      };
    }

    let status: Status | undefined = undefined;

    if (updateUserDto.status?.id) {
      const statusObject = Object.values(StatusEnum)
        .map(String)
        .includes(String(updateUserDto.status.id));
      if (!statusObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            status: 'statusNotExists',
          },
        });
      }

      status = {
        id: updateUserDto.status.id,
      };
    }

    return this.usersRepository.update(id, {
      // Do not remove comment below.
      // <updating-property-payload />
      firstName: updateUserDto.firstName,
      lastName: updateUserDto.lastName,
      email,
      password,
      photo,
      role,
      status,
      provider: updateUserDto.provider,
      socialId: updateUserDto.socialId,
    });
  }

  /**
   * Approve a pending agent account.
   *
   * Sets the user's status from inactive → active, allowing them to log in.
   * Only callable by super_admin or admin (enforced at the controller layer).
   *
   * @param id - MongoDB _id of the agent to approve
   * @returns The updated user record with status=active
   * @throws NotFoundException  if no user exists with that id
   * @throws UnprocessableEntityException if the user is not a pending agent
   */
  async approveAgent(id: User['id']): Promise<User> {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User ${String(id)} not found`);
    }

    if (Number(user.role?.id) !== RoleEnum.agent) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: { user: 'notAnAgent' },
      });
    }

    if (Number(user.status?.id) === StatusEnum.active) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: { user: 'agentAlreadyActive' },
      });
    }

    return this.usersRepository.update(id, {
      status: { id: StatusEnum.active },
    }) as Promise<User>;
  }

  async remove(id: User['id']): Promise<void> {
    await this.usersRepository.remove(id);
  }
}
