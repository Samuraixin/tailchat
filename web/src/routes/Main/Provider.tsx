import {
  createSocket,
  createStore,
  setupRedux,
  useAsync,
  userActions,
} from 'pawchat-shared';
import React, { useMemo } from 'react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Provider as ReduxProvider } from 'react-redux';
import { getGlobalUserLoginInfo } from '../../utils/user-helper';
import _isNil from 'lodash/isNil';
import { loginWithToken } from 'pawchat-shared/model/user';
import { getUserJWT } from '../../utils/jwt-helper';
import { useHistory } from 'react-router';

/**
 * 应用状态管理hooks
 */
function useAppState() {
  const history = useHistory();

  const { value, loading } = useAsync(async () => {
    let userLoginInfo = getGlobalUserLoginInfo();
    if (_isNil(userLoginInfo)) {
      // 如果没有全局缓存的数据, 则尝试自动登录
      try {
        const token = await getUserJWT();
        if (typeof token !== 'string') {
          throw new Error('Token 不合法');
        }
        userLoginInfo = await loginWithToken(token);
      } catch (e) {
        // 当前 Token 不存在或已过期
        history.replace('/entry/login');
        return;
      }
    }

    // 到这里 userLoginInfo 必定存在
    // 创建Redux store
    const store = createStore();
    store.dispatch(userActions.setUserInfo(userLoginInfo));

    // 创建 websocket 连接
    const socket = await createSocket(userLoginInfo.token);

    // 初始化Redux
    setupRedux(socket, store);

    return { store, socket };
  }, [history]);

  const store = value?.store;
  const socket = value?.socket;

  return { loading, store, socket };
}

/**
 * 主页面核心数据Provider
 * 在主页存在
 */
export const MainProvider: React.FC = React.memo((props) => {
  const { loading, store } = useAppState();

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-700 text-white text-xl">
        <LoadingSpinner tip="正在连接到聊天服务器..." />
      </div>
    );
  }

  if (_isNil(store)) {
    return <div>出现异常, Store 创建失败</div>;
  }

  return <ReduxProvider store={store}>{props.children}</ReduxProvider>;
});
MainProvider.displayName = 'MainProvider';