#include <jni.h>

#include <hermes/hermes.h>
#include <jsi/jsi.h>

#include <memory>
#include <optional>
#include <string>

using namespace facebook;

namespace {

struct Engine {
  std::unique_ptr<jsi::Runtime> runtime;
  jsi::Function string;

  explicit Engine(std::unique_ptr<jsi::Runtime> rt)
      : runtime(std::move(rt)),
        string(runtime->global().getPropertyAsFunction(*runtime, "String")) {}

  jstring stringify(JNIEnv *env, const jsi::Value &value) {
    std::u16string text = string.call(*runtime, value).getString(*runtime).utf16(*runtime);
    return env->NewString(reinterpret_cast<const jchar *>(text.data()), static_cast<jsize>(text.size()));
  }

  jstring describe(JNIEnv *env, const jsi::JSError &error) {
    try {
      return stringify(env, error.value());
    } catch (const std::exception &) {
      return env->NewStringUTF(error.getMessage().c_str());
    }
  }
};

} // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_dev_markless_mobile_engine_HermesEngine_nativeCreate(JNIEnv *, jobject) {
  auto config = ::hermes::vm::RuntimeConfig::Builder().withMicrotaskQueue(true).build();
  return reinterpret_cast<jlong>(new Engine(facebook::hermes::makeHermesRuntime(config)));
}

extern "C" JNIEXPORT jstring JNICALL
Java_dev_markless_mobile_engine_HermesEngine_nativeEvaluate(JNIEnv *env, jobject, jlong handle, jbyteArray source) {
  auto *engine = reinterpret_cast<Engine *>(handle);
  jsi::Runtime &rt = *engine->runtime;
  std::string script(static_cast<size_t>(env->GetArrayLength(source)), '\0');
  env->GetByteArrayRegion(source, 0, static_cast<jsize>(script.size()), reinterpret_cast<jbyte *>(script.data()));
  std::optional<jsi::Value> value;
  jstring failure = nullptr;
  try {
    value = rt.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(std::move(script)), "script");
  } catch (const jsi::JSError &error) {
    failure = engine->describe(env, error);
  } catch (const std::exception &error) {
    failure = env->NewStringUTF(error.what());
  }
  // A throwing job is already off the queue, so draining again runs the jobs behind it.
  for (bool drained = false; !drained;) {
    try {
      drained = rt.drainMicrotasks();
    } catch (const jsi::JSError &error) {
      if (!failure) failure = engine->describe(env, error);
    } catch (const std::exception &error) {
      if (!failure) failure = env->NewStringUTF(error.what());
      break;
    }
  }
  if (!failure) {
    try {
      return engine->stringify(env, *value);
    } catch (const jsi::JSError &error) {
      failure = engine->describe(env, error);
    } catch (const std::exception &error) {
      failure = env->NewStringUTF(error.what());
    }
  }
  jclass type = env->FindClass("dev/markless/mobile/engine/HermesException");
  env->Throw(static_cast<jthrowable>(
      env->NewObject(type, env->GetMethodID(type, "<init>", "(Ljava/lang/String;)V"), failure)));
  return nullptr;
}

extern "C" JNIEXPORT void JNICALL
Java_dev_markless_mobile_engine_HermesEngine_nativeDestroy(JNIEnv *, jobject, jlong handle) {
  delete reinterpret_cast<Engine *>(handle);
}
