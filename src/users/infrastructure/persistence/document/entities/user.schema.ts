import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { now, HydratedDocument } from 'mongoose';

import { AuthProvidersEnum } from '../../../../../auth/auth-providers.enum';
import { FileSchemaClass } from '../../../../../files/infrastructure/persistence/document/entities/file.schema';
import { EntityDocumentHelper } from '../../../../../utils/document-entity-helper';
import { StatusSchema } from '../../../../../statuses/infrastructure/persistence/document/entities/status.schema';
import { RoleSchema } from '../../../../../roles/infrastructure/persistence/document/entities/role.schema';

export type UserSchemaDocument = HydratedDocument<UserSchemaClass>;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    getters: true,
  },
})
export class UserSchemaClass extends EntityDocumentHelper {
  @Prop({
    type: String,
    unique: true,
  })
  email: string | null;

  @Prop()
  password?: string;

  @Prop({
    default: AuthProvidersEnum.email,
  })
  provider: string;

  @Prop({
    type: String,
    default: null,
  })
  socialId?: string | null;

  @Prop({
    type: String,
  })
  firstName: string | null;

  @Prop({
    type: String,
  })
  lastName: string | null;

  @Prop({
    type: FileSchemaClass,
  })
  photo?: FileSchemaClass | null;

  @Prop({
    type: RoleSchema,
  })
  role?: RoleSchema | null;

  @Prop({
    type: StatusSchema,
  })
  status?: StatusSchema;

  /** Human-readable customer ID e.g. CUS-20260313-143052 (only set for role=customer) */
  @Prop({ type: String, default: null })
  customerId?: string | null;

  @Prop({ type: String, default: null })
  phone?: string | null;

  @Prop({ type: String, default: null })
  address?: string | null;

  /** Public wallet reference ID e.g. wlt_lz4abc12_x7r9kp2q */
  @Prop({ type: String, default: null })
  walletId?: string | null;

  /** Organization _id this client user belongs to (only set for role=client) */
  @Prop({ type: String, default: null })
  organizationId?: string | null;

  @Prop({ type: Boolean, default: false })
  isBlocked?: boolean;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;

  @Prop()
  deletedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserSchemaClass);

UserSchema.index({ 'role._id': 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ customerId: 1 }, { sparse: true });
