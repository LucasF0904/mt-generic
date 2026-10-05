import 'blessed';
declare module 'blessed' {
  namespace Widgets {
    interface Screen { destroyed: boolean; }
  }
}
