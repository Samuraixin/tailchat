import { AllPermission, permissionList } from '@/utils/role-helper';
import { Button } from 'antd';
import React, { useCallback, useMemo } from 'react';
import { model, t } from 'tailchat-shared';
import { PermissionItem } from '../PermissionItem';
import { useModifyPermission } from '../useModifyPermission';

interface RolePermissionProps {
  roleId: typeof AllPermission | string;
  currentRoleInfo?: model.group.GroupRole;
  fallbackPermissions: string[];
  onSavePermission: (permissions: string[]) => Promise<void>;
}
export const RolePermission: React.FC<RolePermissionProps> = React.memo(
  (props) => {
    const currentRolePermissions: string[] = useMemo(() => {
      if (props.roleId === AllPermission) {
        return props.fallbackPermissions;
      }

      return props.currentRoleInfo?.permissions ?? [];
    }, [props.roleId, props.fallbackPermissions, props.currentRoleInfo]);

    const {
      isEditing,
      editingPermission,
      setEditingPermission,
      handleSwitchPermission,
    } = useModifyPermission(currentRolePermissions);

    const handleResetPermission = useCallback(() => {
      setEditingPermission(
        permissionList.filter((p) => p.default === true).map((p) => p.key)
      );
    }, []);

    // 权限概述
    return (
      <div>
        <div className="mb-2 space-x-2 text-right">
          <Button onClick={handleResetPermission}>{t('重置为默认值')}</Button>
          <Button
            type="primary"
            disabled={!isEditing}
            onClick={() => props.onSavePermission(editingPermission)}
          >
            {t('保存')}
          </Button>
        </div>

        {/* 权限详情 */}
        {permissionList.map((p) => (
          <PermissionItem
            key={p.key}
            title={p.title}
            desc={p.desc}
            checked={editingPermission.includes(p.key)}
            onChange={(checked) => handleSwitchPermission(p.key, checked)}
          />
        ))}
      </div>
    );
  }
);
RolePermission.displayName = 'RolePermission';
