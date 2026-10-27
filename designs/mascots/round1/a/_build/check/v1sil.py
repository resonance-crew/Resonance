import sys
sys.path.insert(0, '../v1')
from tingya import Drawer, MAIN
print(Drawer(MAIN, 'a-v1-', seed=7).silhouette(cls='sil'))
