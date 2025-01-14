# Author: Kang Lin(kl222@126.com)

# Use: Please add the follow code to CMakeLists.txt

# # Install runtime target
# add_custom_target(install-runtime
#  COMMAND
#     "${CMAKE_COMMAND}" -DCMAKE_INSTALL_COMPONENT=Runtime 
#     -P "${CMAKE_CURRENT_BINARY_DIR}/cmake_install.cmake"
# )
# # Uninstall runtime target
# add_custom_target(uninstall-runtime
#  COMMAND
#     "${CMAKE_COMMAND}" -DCMAKE_INSTALL_COMPONENT=Runtime 
#     -P "${CMAKE_CURRENT_BINARY_DIR}/cmake_uninstall.cmake"
# )
# # Create will be delete files
# CONFIGURE_FILE(
#    "${CMAKE_CURRENT_SOURCE_DIR}/cmake/cmake_uninstall.cmake.in"
#    "${CMAKE_BINARY_DIR}/cmake_uninstall.cmake"
#    IMMEDIATE @ONLY)
# # Create unistall target
# ADD_CUSTOM_TARGET(uninstall
#    "${CMAKE_COMMAND}" -P "${CMAKE_BINARY_DIR}/cmake_uninstall.cmake"
#    DEPENDS uninstall-runtime)


if(CMAKE_INSTALL_COMPONENT)
    set(CMAKE_INSTALL_MANIFEST "install_manifest_${CMAKE_INSTALL_COMPONENT}.txt")
else()
    set(CMAKE_INSTALL_MANIFEST "install_manifest.txt")
endif()

IF(NOT EXISTS "C:/Users/Lasttry/Desktop/dip/coturn/${CMAKE_INSTALL_MANIFEST}")
    MESSAGE(WARNING "Cannot find install manifest: \"C:/Users/Lasttry/Desktop/dip/coturn/${CMAKE_INSTALL_MANIFEST}\"")
ELSE()

    FILE(READ "C:/Users/Lasttry/Desktop/dip/coturn/${CMAKE_INSTALL_MANIFEST}" files)
    STRING(REGEX REPLACE "\n" ";" files "${files}")
    FOREACH(file ${files})
        MESSAGE(STATUS "Uninstalling \"${file}\"")
        IF(EXISTS "${file}")
            EXEC_PROGRAM(
                "C:/Program Files/CMake/bin/cmake.exe" ARGS "-E remove \"${file}\""
                OUTPUT_VARIABLE rm_out
                RETURN_VALUE rm_retval
                )
            IF("${rm_retval}" STREQUAL 0)
            ELSE("${rm_retval}" STREQUAL 0)
                MESSAGE(FATAL_ERROR "Problem when removing \"${file}\"")
            ENDIF("${rm_retval}" STREQUAL 0)
        ELSE(EXISTS "${file}")
            MESSAGE(STATUS "File \"${file}\" does not exist.")
        ENDIF(EXISTS "${file}")
    ENDFOREACH(file)

ENDIF()
