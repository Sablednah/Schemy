cmake_minimum_required(VERSION 3.24)
project(SchemyShell LANGUAGES CXX)

add_library(SchemyShell SHARED SchemyShell.cpp SchemyShell.def)
target_compile_features(SchemyShell PRIVATE cxx_std_20)
target_compile_definitions(SchemyShell PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX _WIN32_WINNT=0x0A00)
target_link_libraries(SchemyShell PRIVATE ole32 windowscodecs shlwapi gdi32 shell32 advapi32)

add_executable(SchemyPreviewBroker WIN32 SchemyPreviewBroker.cpp)
target_compile_features(SchemyPreviewBroker PRIVATE cxx_std_20)
target_compile_definitions(SchemyPreviewBroker PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX _WIN32_WINNT=0x0A00)
target_link_libraries(SchemyPreviewBroker PRIVATE shlwapi advapi32)

set_target_properties(SchemyShell PROPERTIES
  OUTPUT_NAME "SchemyShell"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/out"
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/out"
)

set_target_properties(SchemyPreviewBroker PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/out"
)

foreach(configuration Debug Release RelWithDebInfo MinSizeRel)
  string(TOUPPER "${configuration}" configuration_upper)
  set_target_properties(SchemyShell PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY_${configuration_upper} "${CMAKE_CURRENT_SOURCE_DIR}/out"
    LIBRARY_OUTPUT_DIRECTORY_${configuration_upper} "${CMAKE_CURRENT_SOURCE_DIR}/out"
  )
  set_target_properties(SchemyPreviewBroker PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY_${configuration_upper} "${CMAKE_CURRENT_SOURCE_DIR}/out"
  )
endforeach()
